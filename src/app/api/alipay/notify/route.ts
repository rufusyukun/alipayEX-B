import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import {
  getOrder,
  getOrderByProviderOrderId,
  markAlipayPaid,
  recordPaymentEvent,
} from "@/lib/recharge-store";
import type { RechargeOrder } from "@/lib/recharge-store";
import {
  generateUnifiedOrderSign,
  getUnifiedOrderConfig,
} from "@/lib/payments/unified-order";

function readString(payload: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = payload[key];
    if (value !== undefined && value !== null && String(value) !== "") {
      return String(value);
    }
  }

  return "";
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function verifySign(payload: Record<string, unknown>, apiKey: string) {
  const sign = readString(payload, ["sign", "signValue"]);

  if (!sign || !apiKey) {
    return false;
  }

  const expected = generateUnifiedOrderSign(payload, apiKey);
  return safeEqual(sign.toUpperCase(), expected.toUpperCase());
}

function isPaidState(value: string) {
  const normalized = value.toUpperCase();
  return (
    value === "2" ||
    normalized === "PAID" ||
    normalized === "SUCCESS" ||
    normalized === "SUCCESS" ||
    normalized === "PAY_SUCCESS" ||
    normalized === "TRADE_SUCCESS" ||
    normalized === "TRADE_FINISHED" ||
    normalized === "PAID"
  );
}

function amountMatches(order: RechargeOrder, payload: Record<string, unknown>) {
  const amount = readString(payload, ["amount", "totalAmount", "total_amount"]);

  if (!amount) {
    return true;
  }

  return Number(amount) === order.amount_cents;
}

function getIp(request: Request) {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-real-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    ""
  );
}

function logNotifyAccess(request: Request, payload: Record<string, unknown>) {
  const url = new URL(request.url);
  const ip = getIp(request);
  const fromExpectedIp = ip === "47.109.198.197";
  const logPayload = {
    path: "/api/alipay/notify",
    method: request.method,
    userAgent: request.headers.get("user-agent") || "",
    xForwardedFor: request.headers.get("x-forwarded-for") || "",
    cfConnectingIp: request.headers.get("cf-connecting-ip") || "",
    xRealIp: request.headers.get("x-real-ip") || "",
    bodyKeys: Object.keys(payload).sort(),
    queryKeys: Array.from(url.searchParams.keys()).sort(),
    fromExpectedCallbackIp: fromExpectedIp,
  };

  if (fromExpectedIp) {
    console.info("[alipay notify] /api/alipay/notify access", logPayload);
  } else {
    console.warn("[alipay notify] /api/alipay/notify access from unexpected ip", logPayload);
  }
}

async function parsePayload(request: Request) {
  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    return ((await request.json().catch(() => ({}))) || {}) as Record<string, unknown>;
  }

  const formData = await request.formData().catch(() => null);
  const payload: Record<string, unknown> = {};
  formData?.forEach((value, key) => {
    payload[key] = String(value);
  });

  return payload;
}

async function findNotifyOrder(orderNo: string, providerOrderId: string) {
  if (orderNo) {
    const order = await getOrder(orderNo);

    if (order) {
      return order;
    }
  }

  if (providerOrderId) {
    return getOrderByProviderOrderId(providerOrderId);
  }

  return null;
}

async function saveEvent(input: {
  orderNo: string;
  tradeStatus: string;
  payload: Record<string, unknown>;
  signVerified: boolean;
  processResult: string;
}) {
  try {
    await recordPaymentEvent({
      orderNo: input.orderNo,
      eventType: "notify",
      tradeStatus: input.tradeStatus,
      rawPayload: input.payload,
      signVerified: input.signVerified,
      processResult: input.processResult,
    });
  } catch (error) {
    console.error("failed to save unified order notify payload", error);
  }
}

function parsePaidAt(value: string) {
  if (!value) {
    return new Date().toISOString();
  }

  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    const timestamp = value.length === 10 ? numeric * 1000 : numeric;
    return new Date(timestamp).toISOString();
  }

  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString();
  }

  return new Date().toISOString();
}

function logNotifyProcess(input: {
  mchOrderNo: string;
  payOrderId: string;
  channelOrderNo: string;
  state: string;
  successTime: string;
  foundOrder: boolean;
  updatedPaid: boolean;
  updateError?: string;
}) {
  console.info("[alipay notify] process result", input);
}

export async function POST(request: Request) {
  const payload = await parsePayload(request);
  logNotifyAccess(request, payload);
  const { config, configured, missing } = getUnifiedOrderConfig();
  const signVerified = configured ? verifySign(payload, config.apiKey) : false;
  const orderNo = readString(payload, ["mchOrderNo", "order_no", "out_trade_no"]);
  const providerOrderId = readString(payload, ["payOrderId", "provider_order_id", "trade_no"]);
  const channelOrderNo = readString(payload, ["channelOrderNo", "alipay_trade_no"]);
  const successTime = readString(payload, ["successTime", "paid_at"]);
  const tradeStatus = readString(payload, ["state", "orderState", "status", "trade_status"]) || "unknown";
  const order = await findNotifyOrder(orderNo, providerOrderId);
  const eventOrderNo = order?.order_no || orderNo || "unknown";

  if (!configured) {
    await saveEvent({
      orderNo: eventOrderNo,
      tradeStatus,
      payload,
      signVerified,
      processResult: `notify_config_missing:${missing.join(",")}`,
    });
    return new NextResponse("failure", { status: 200 });
  }

  if (!order) {
    await saveEvent({
      orderNo: eventOrderNo,
      tradeStatus,
      payload,
      signVerified,
      processResult: "notify_order_not_found",
    });
    logNotifyProcess({
      mchOrderNo: orderNo,
      payOrderId: providerOrderId,
      channelOrderNo,
      state: tradeStatus,
      successTime,
      foundOrder: false,
      updatedPaid: false,
    });
    return new NextResponse("failure", { status: 200 });
  }

  const notifyAppId = readString(payload, ["appId"]);
  const notifyMchNo = readString(payload, ["mchNo", "merchantId"]);

  if (
    (notifyAppId && notifyAppId !== config.appId) ||
    (notifyMchNo && notifyMchNo !== config.merchantId) ||
    !amountMatches(order, payload)
  ) {
    await saveEvent({
      orderNo: order.order_no,
      tradeStatus,
      payload,
      signVerified,
      processResult: "notify_business_check_failed",
    });
    return new NextResponse("failure", { status: 200 });
  }

  if (isPaidState(tradeStatus)) {
    try {
      await markAlipayPaid({
        orderNo: order.order_no,
        alipayTradeNo: channelOrderNo || providerOrderId || order.alipay_trade_no,
        providerOrderId: providerOrderId || order.provider_order_id,
        signVerified,
        paidAt: parsePaidAt(successTime),
        rawResponse: payload,
      });

      await saveEvent({
        orderNo: order.order_no,
        tradeStatus,
        payload,
        signVerified,
        processResult: "paid_updated",
      });
      logNotifyProcess({
        mchOrderNo: orderNo,
        payOrderId: providerOrderId,
        channelOrderNo,
        state: tradeStatus,
        successTime,
        foundOrder: true,
        updatedPaid: true,
      });
    } catch (error) {
      const updateError = error instanceof Error ? error.message : "unknown error";
      await saveEvent({
        orderNo: order.order_no,
        tradeStatus,
        payload,
        signVerified,
        processResult: `paid_update_failed:${updateError}`,
      });
      logNotifyProcess({
        mchOrderNo: orderNo,
        payOrderId: providerOrderId,
        channelOrderNo,
        state: tradeStatus,
        successTime,
        foundOrder: true,
        updatedPaid: false,
        updateError,
      });
      return new NextResponse("failure", { status: 200 });
    }
  } else {
    await saveEvent({
      orderNo: order.order_no,
      tradeStatus,
      payload,
      signVerified,
      processResult: "state_not_success",
    });
    logNotifyProcess({
      mchOrderNo: orderNo,
      payOrderId: providerOrderId,
      channelOrderNo,
      state: tradeStatus,
      successTime,
      foundOrder: true,
      updatedPaid: false,
    });
  }

  return new NextResponse("success", {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const payload = Object.fromEntries(url.searchParams.entries());
  logNotifyAccess(request, payload);

  return NextResponse.json({
    ok: true,
    message: "notify route is reachable",
  });
}
