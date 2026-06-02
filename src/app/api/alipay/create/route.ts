import { NextResponse } from "next/server";
import { getPaymentProvider } from "@/lib/payments";
import { getOrder, recordProviderCreateResult } from "@/lib/recharge-store";

type ProviderRawResponse = {
  code?: string | number;
  msg?: string;
  payData?: string;
  payDataType?: string;
  payOrderId?: string;
};

function createDebugPayload(input: {
  provider: string;
  providerOrderId?: string | null;
  paymentUrl?: string | null;
  rawResponse?: unknown;
}) {
  const raw = (input.rawResponse || {}) as ProviderRawResponse;
  const paymentUrl = input.paymentUrl || raw.payData || "";
  let host = "";

  try {
    host = paymentUrl ? new URL(paymentUrl).host : "";
  } catch {
    host = "非标准 URL";
  }

  return {
    provider: input.provider,
    payDataType: raw.payDataType || null,
    payment_url_host: host,
    payment_url_prefix: paymentUrl.slice(0, 80),
    provider_order_id: input.providerOrderId || raw.payOrderId || null,
    raw_code: raw.code ?? null,
    raw_msg: raw.msg ?? null,
  };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as { order_no?: unknown } | null;
    const orderNo = typeof body?.order_no === "string" ? body.order_no : "";

    if (!orderNo) {
      return NextResponse.json({ error: "缺少订单号" }, { status: 400 });
    }

    const order = await getOrder(orderNo);

    if (!order) {
      return NextResponse.json({ error: "订单不存在" }, { status: 404 });
    }

    if (order.payment_status !== "pending") {
      return NextResponse.json({ error: "订单不是待支付状态" }, { status: 409 });
    }

    const provider = getPaymentProvider();
    const result = await provider.createPayment(order);
    const shouldIncludeDebug = process.env.NODE_ENV === "development";
    const debug = shouldIncludeDebug
      ? createDebugPayload({
          provider: result.provider,
          providerOrderId: result.providerOrderId,
          paymentUrl: result.paymentUrl,
          rawResponse: result.rawResponse,
        })
      : undefined;

    if (!result.configured) {
      return NextResponse.json(
        {
          error: result.error || "支付接口未配置，请联系管理员",
          provider: result.provider,
          missing: result.missing,
          ...(debug ? { debug } : {}),
        },
        { status: 503 },
      );
    }

    if (!result.paymentUrl) {
      await recordProviderCreateResult({
        orderNo,
        provider: result.provider,
        providerOrderId: result.providerOrderId,
        rawResponse: result.rawResponse || null,
        paymentUrl: null,
      });

      return NextResponse.json(
        {
          error: result.error || "支付链接创建失败",
          provider: result.provider,
          raw_response: result.rawResponse,
          ...(debug ? { debug } : {}),
        },
        { status: 502 },
      );
    }

    await recordProviderCreateResult({
      orderNo,
      provider: result.provider,
      providerOrderId: result.providerOrderId,
      rawResponse: result.rawResponse || null,
      paymentUrl: result.paymentUrl,
    });

    return NextResponse.json({
      type: "redirect",
      provider: result.provider,
      payment_url: result.paymentUrl,
      order_no: orderNo,
      provider_order_id: result.providerOrderId || null,
      raw_response: result.rawResponse,
      ...(debug ? { debug } : {}),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "数据库未配置，请联系管理员",
        debug: error instanceof Error ? error.message : "unknown error",
      },
      { status: 500 },
    );
  }
}
