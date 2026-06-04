import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/auth";
import { queryUnifiedOrder } from "@/lib/payments/unified-order";
import {
  listOrders,
  markAlipayPaid,
  recordPaymentEvent,
  type RechargeOrder,
} from "@/lib/recharge-store";

type QueryResponse = {
  code?: string | number;
  msg?: string;
  data?: Record<string, unknown>;
  state?: string | number;
  orderState?: string | number;
  status?: string | number;
  payStatus?: string | number;
  tradeState?: string | number;
  tradeStatus?: string | number;
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
    value === "3" ||
    normalized === "PAID" ||
    normalized === "SUCCESS" ||
    normalized === "PAY_SUCCESS" ||
    normalized === "TRADE_SUCCESS" ||
    normalized === "TRADE_FINISHED"
  );
}

function extractQueryStatus(rawResponse: unknown) {
  const raw = (rawResponse || {}) as QueryResponse;
  const data = (raw.data || {}) as Record<string, unknown>;
  const root = raw as unknown as Record<string, unknown>;
  const orderState =
    readString(data, ["orderState", "state", "status", "payStatus", "tradeState", "tradeStatus"]) ||
    readString(root, ["orderState", "state", "status", "payStatus", "tradeState", "tradeStatus"]);
  const providerOrderId =
    readString(data, ["payOrderId", "provider_order_id", "trade_no", "tradeNo"]) ||
    readString(root, ["payOrderId", "provider_order_id", "trade_no", "tradeNo"]);
  const paidAt =
    readString(data, ["successTime", "paidAt", "paid_at", "paySuccessTime"]) ||
    readString(root, ["successTime", "paidAt", "paid_at", "paySuccessTime"]);

  return {
    orderState,
    paymentStatus: isSuccessCode(raw.code) && isPaidState(orderState) ? "paid" : "pending",
    providerOrderId,
    paidAt,
    querySucceeded: isSuccessCode(raw.code),
  };
}

function buildCandidateOrders(orders: RechargeOrder[]) {
  const cutoff = Date.now() - 30 * 60 * 1000;
  const recentPending = orders.filter((order) => new Date(order.created_at).getTime() >= cutoff);
  const latestPending = orders.slice(0, 50);
  const byOrderNo = new Map<string, RechargeOrder>();

  for (const order of [...recentPending, ...latestPending]) {
    byOrderNo.set(order.order_no, order);
  }

  return [...byOrderNo.values()].slice(0, 50);
}

export async function POST(request: Request) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  try {
    const pendingOrders = await listOrders({ paymentStatus: "pending" });
    const candidates = buildCandidateOrders(pendingOrders);

    console.info("[admin sync pending] candidate orderNo list", {
      count: candidates.length,
      orderNos: candidates.map((order) => order.order_no),
    });

    let syncedCount = 0;
    const results = [];

    for (const order of candidates) {
      console.info("[admin sync pending] querying orderNo", { orderNo: order.order_no });

      const queryResult = await queryUnifiedOrder(order.order_no);
      const status = extractQueryStatus(queryResult.rawResponse);
      let synced = false;

      if (queryResult.configured && status.querySucceeded && status.paymentStatus === "paid") {
        const updatedOrder = await markAlipayPaid({
          orderNo: order.order_no,
          alipayTradeNo: status.providerOrderId || order.alipay_trade_no,
          providerOrderId: status.providerOrderId || order.provider_order_id,
          paidAt: status.paidAt || order.paid_at,
          rawResponse: queryResult.rawResponse,
          signVerified: false,
        });

        synced = updatedOrder?.payment_status === "paid";

        await recordPaymentEvent({
          orderNo: order.order_no,
          eventType: "admin_auto_sync_pending",
          tradeStatus: status.orderState || "paid",
          rawPayload: {
            order_no: order.order_no,
            raw_response: queryResult.rawResponse,
          },
          processResult: synced ? "query_paid_order_updated" : "query_paid_update_failed",
          signVerified: null,
        });

        if (synced) {
          syncedCount += 1;
          console.info("[admin sync pending] updated orderNo", { orderNo: order.order_no });
        }
      } else {
        await recordPaymentEvent({
          orderNo: order.order_no,
          eventType: "admin_auto_sync_pending",
          tradeStatus: status.orderState || order.payment_status,
          rawPayload: {
            order_no: order.order_no,
            raw_response: queryResult.rawResponse,
          },
          processResult: queryResult.configured
            ? `query_recorded_state:${status.orderState || "unknown"}`
            : "query_config_missing",
          signVerified: null,
        });
      }

      console.info("[admin sync pending] query result orderState/paymentStatus/synced", {
        orderNo: order.order_no,
        orderState: status.orderState || "unknown",
        paymentStatus: status.paymentStatus,
        synced,
        configured: queryResult.configured,
      });

      results.push({
        orderNo: order.order_no,
        orderState: status.orderState || null,
        paymentStatus: status.paymentStatus,
        synced,
      });
    }

    return NextResponse.json({
      candidateCount: candidates.length,
      candidateOrderNos: candidates.map((order) => order.order_no),
      syncedCount,
      results,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "同步最近待支付订单失败",
        debug: error instanceof Error ? error.message : "unknown error",
      },
      { status: 500 },
    );
  }
}
