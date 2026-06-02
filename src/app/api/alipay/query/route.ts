import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/auth";
import { getPaymentProviderName } from "@/lib/payments";
import {
  generateUnifiedOrderSign,
  getUnifiedOrderConfig,
  queryUnifiedOrder,
} from "@/lib/payments/unified-order";
import { getOrder, markAlipayPaid, recordPaymentEvent } from "@/lib/recharge-store";

type QueryResponse = {
  code?: string | number;
  msg?: string;
  data?: Record<string, unknown>;
  sign?: string;
};

function readString(payload: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = payload[key];
    if (value !== undefined && value !== null && String(value) !== "") {
      return String(value);
    }
  }

  return "";
}

function isSuccessCode(value: string | number | undefined) {
  return value === 0 || value === "0";
}

function isPaidState(value: string) {
  const normalized = value.toUpperCase();

  return (
    value === "2" ||
    normalized === "PAID" ||
    normalized === "SUCCESS" ||
    normalized === "PAY_SUCCESS" ||
    normalized === "TRADE_SUCCESS" ||
    normalized === "TRADE_FINISHED"
  );
}

function verifyQueryResponseSign(rawResponse: QueryResponse) {
  const sign = rawResponse.sign;
  const data = rawResponse.data;

  if (!sign || !data) {
    return null;
  }

  const { config, configured } = getUnifiedOrderConfig();

  if (!configured) {
    return false;
  }

  const expected = generateUnifiedOrderSign(data, config.apiKey);
  return sign.toUpperCase() === expected.toUpperCase();
}

function extractQueryStatus(rawResponse: unknown) {
  const raw = (rawResponse || {}) as QueryResponse;
  const data = (raw.data || {}) as Record<string, unknown>;
  const orderState = readString(data, ["orderState", "state", "status", "tradeStatus"]);
  const providerOrderId = readString(data, ["payOrderId", "provider_order_id", "trade_no"]);

  return {
    orderState,
    providerOrderId,
    querySucceeded: isSuccessCode(raw.code),
    signVerified: verifyQueryResponseSign(raw),
  };
}

export async function GET(request: Request) {
  const isAdmin = isAdminRequest(request);

  try {
    const { searchParams } = new URL(request.url);
    const orderNo = searchParams.get("order_no") || searchParams.get("orderNo") || "";

    if (!orderNo) {
      return NextResponse.json({ error: "缺少订单号" }, { status: 400 });
    }

    const order = await getOrder(orderNo);
    if (!order) {
      return NextResponse.json({ error: "订单不存在" }, { status: 404 });
    }

    const provider = getPaymentProviderName();
    const queryResult =
      provider === "unified_order"
        ? await queryUnifiedOrder(orderNo)
        : { configured: false, missing: [], rawResponse: null };
    const status = extractQueryStatus(queryResult.rawResponse);
    let processResult = queryResult.configured ? "query_sent" : "query_config_missing";
    let syncedOrder = null;

    if (queryResult.configured && status.querySucceeded && isPaidState(status.orderState)) {
      syncedOrder = await markAlipayPaid({
        orderNo,
        alipayTradeNo: status.providerOrderId || order.alipay_trade_no,
        providerOrderId: status.providerOrderId || order.provider_order_id,
        signVerified: status.signVerified === true,
      });
      processResult = "query_paid_order_updated";
    } else if (queryResult.configured && status.querySucceeded) {
      processResult = `query_recorded_state:${status.orderState || "unknown"}`;
    }

    await recordPaymentEvent({
      orderNo,
      eventType: isAdmin ? "payment_query_admin" : "payment_query_return_url",
      tradeStatus: status.orderState || order.payment_status,
      rawPayload: { order_no: orderNo, provider, raw_response: queryResult.rawResponse },
      processResult,
      signVerified: status.signVerified,
    });

    console.info("[unified_order] payment query sync", {
      orderNo,
      provider,
      orderState: status.orderState || "unknown",
      synced: Boolean(syncedOrder),
      paymentStatus: syncedOrder?.payment_status || order.payment_status,
      isAdmin,
    });

    const responseBody = {
      order_no: orderNo,
      provider,
      configured: queryResult.configured,
      missing: isAdmin ? queryResult.missing : undefined,
      synced: Boolean(syncedOrder),
      payment_status: syncedOrder?.payment_status || order.payment_status,
      order_state: status.orderState || null,
      provider_order_id: status.providerOrderId || null,
      sign_verified: status.signVerified,
      message: queryResult.configured
        ? syncedOrder
          ? "查单成功，已同步支付状态"
          : "查单完成，未发现支付成功状态"
        : "支付接口未配置，请联系管理员",
      ...(isAdmin ? { raw_response: queryResult.rawResponse } : {}),
    };

    return NextResponse.json(responseBody);
  } catch (error) {
    return NextResponse.json(
      {
        error: "查单失败，请稍后重试",
        debug: isAdmin ? (error instanceof Error ? error.message : "unknown error") : undefined,
      },
      { status: 500 },
    );
  }
}
