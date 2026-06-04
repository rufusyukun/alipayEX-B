import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/auth";
import { getPaymentProviderName } from "@/lib/payments";
import { queryUnifiedOrder } from "@/lib/payments/unified-order";
import { parseUnifiedOrderState } from "@/lib/payments/unified-order-state";
import {
  getOrder,
  getOrderByProviderOrderId,
  recordPaymentEvent,
  updatePaymentStatusFromQuery,
} from "@/lib/recharge-store";

function summarizeQueryResponse(rawResponse: unknown) {
  const parsed = parseUnifiedOrderState(rawResponse);
  const raw = (rawResponse || {}) as { code?: string | number; msg?: string; data?: unknown };

  return {
    code: raw.code ?? null,
    msg: raw.msg ?? null,
    orderState: parsed.orderState || null,
    providerOrderId: parsed.providerOrderId || null,
    parsedPaymentStatus: parsed.paymentStatus,
    hasData: Boolean(raw.data),
  };
}

export async function GET(request: Request) {
  const isAdmin = isAdminRequest(request);

  try {
    const { searchParams } = new URL(request.url);
    const requestedOrderNo = searchParams.get("order_no") || searchParams.get("orderNo") || "";
    const requestedProviderOrderId =
      searchParams.get("providerOrderId") || searchParams.get("payOrderId") || "";

    if (!requestedOrderNo && !requestedProviderOrderId) {
      return NextResponse.json({ error: "缺少订单号" }, { status: 400 });
    }

    const order = requestedOrderNo
      ? await getOrder(requestedOrderNo)
      : await getOrderByProviderOrderId(requestedProviderOrderId);

    if (!order) {
      return NextResponse.json(
        {
          error: requestedProviderOrderId ? "平台订单未匹配本地订单" : "订单不存在",
          provider_order_id: requestedProviderOrderId || null,
        },
        { status: 404 },
      );
    }

    const provider = getPaymentProviderName();
    const providerOrderId = requestedProviderOrderId || order.provider_order_id || "";
    const queryResult =
      provider === "unified_order"
        ? await queryUnifiedOrder({ orderNo: order.order_no, providerOrderId })
        : { configured: false, missing: [], rawResponse: null };
    const parsed = parseUnifiedOrderState(queryResult.rawResponse);
    const nextProviderOrderId = parsed.providerOrderId || providerOrderId || order.provider_order_id;
    let processResult = queryResult.configured ? "query_sent" : "query_config_missing";
    let syncedOrder = null;

    if (queryResult.configured && parsed.querySucceeded && parsed.isTerminal) {
      syncedOrder = await updatePaymentStatusFromQuery({
        orderNo: order.order_no,
        paymentStatus: parsed.paymentStatus,
        providerOrderId: nextProviderOrderId,
        rawResponse: queryResult.rawResponse,
      });
      processResult =
        parsed.paymentStatus === "paid"
          ? "query_paid_order_updated"
          : `query_terminal_order_updated:${parsed.paymentStatus}`;
    } else if (queryResult.configured && parsed.querySucceeded) {
      processResult = `query_recorded_state:${parsed.orderState || "unknown"}`;
    }

    try {
      await recordPaymentEvent({
        orderNo: order.order_no,
        eventType: isAdmin ? "payment_query_admin" : "payment_query_return_url",
        tradeStatus: parsed.orderState || order.payment_status,
        rawPayload: {
          order_no: order.order_no,
          provider,
          query_by: providerOrderId ? "payOrderId" : "mchOrderNo",
          provider_order_id: nextProviderOrderId || null,
          raw_response: queryResult.rawResponse,
        },
        processResult,
        signVerified: null,
      });
    } catch (eventError) {
      console.warn("[unified_order] payment query event log failed", {
        localOrderNo: order.order_no,
        error: eventError instanceof Error ? eventError.message : "unknown error",
      });
    }

    const paymentStatus = syncedOrder?.payment_status || order.payment_status;

    console.info("[unified_order] payment query sync", {
      localOrderNo: order.order_no,
      providerOrderIdPresent: Boolean(providerOrderId),
      queryBy: providerOrderId ? "payOrderId" : "mchOrderNo",
      orderState: parsed.orderState || "unknown",
      parsedPaymentStatus: parsed.paymentStatus,
      synced: Boolean(syncedOrder),
      paymentStatus,
      rawResponse: summarizeQueryResponse(queryResult.rawResponse),
      isAdmin,
    });

    return NextResponse.json({
      order_no: order.order_no,
      provider,
      configured: queryResult.configured,
      missing: isAdmin ? queryResult.missing : undefined,
      synced: Boolean(syncedOrder),
      payment_status: paymentStatus,
      paymentStatus,
      status: paymentStatus,
      order_state: parsed.orderState || null,
      orderState: parsed.orderState || null,
      parsedPaymentStatus: parsed.paymentStatus,
      state_label: parsed.stateLabel,
      provider_order_id: nextProviderOrderId || null,
      message: queryResult.configured
        ? syncedOrder
          ? "查单成功，已同步支付状态"
          : "查单完成，未发现需要同步的终态"
        : "支付接口未配置，请联系管理员",
      ...(isAdmin ? { raw_response: queryResult.rawResponse } : {}),
    });
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
