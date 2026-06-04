import { NextResponse } from "next/server";
import { getPaymentProvider } from "@/lib/payments";
import { getOrder, recordProviderCreateResult } from "@/lib/recharge-store";

type ProviderRawResponse = {
  code?: string | number;
  retCode?: string | number;
  msg?: string;
  retMsg?: string;
  payData?: string;
  payDataType?: string;
  payOrderId?: string;
  payUrl?: string;
  cashierUrl?: string;
  checkoutUrl?: string;
  codeUrl?: string;
  qrCode?: string;
  payInfo?: string;
  data?: {
    payOrderId?: string;
    payDataType?: string;
    payUrl?: string;
    payData?: string;
    cashierUrl?: string;
    checkoutUrl?: string;
    codeUrl?: string;
    qrCode?: string;
    payInfo?: string;
  };
};

function isUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

function createDebugPayload(input: {
  provider: string;
  providerOrderId?: string | null;
  paymentUrl?: string | null;
  alipayScheme?: string | null;
  fallbackUrl?: string | null;
  paymentContent?: string | null;
  rawResponse?: unknown;
}) {
  const raw = (input.rawResponse || {}) as ProviderRawResponse;
  const paymentValue =
    input.paymentUrl ||
    input.alipayScheme ||
    input.fallbackUrl ||
    input.paymentContent ||
    raw.payUrl ||
    raw.cashierUrl ||
    raw.checkoutUrl ||
    raw.codeUrl ||
    raw.payData ||
    raw.qrCode ||
    raw.payInfo ||
    raw.data?.payUrl ||
    raw.data?.cashierUrl ||
    raw.data?.checkoutUrl ||
    raw.data?.codeUrl ||
    raw.data?.payData ||
    raw.data?.qrCode ||
    raw.data?.payInfo ||
    "";
  let host = "";

  try {
    host = paymentValue && isUrl(paymentValue) ? new URL(paymentValue).host : "";
  } catch {
    host = "non-standard URL";
  }

  return {
    provider: input.provider,
    payDataType: raw.payDataType || raw.data?.payDataType || null,
    payment_url_host: host,
    payment_value_prefix: paymentValue.slice(0, 80),
    provider_order_id: input.providerOrderId || raw.payOrderId || raw.data?.payOrderId || null,
    raw_code: raw.code ?? raw.retCode ?? null,
    raw_msg: raw.msg ?? raw.retMsg ?? null,
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
          alipayScheme: result.alipayScheme,
          fallbackUrl: result.fallbackUrl,
          paymentContent: result.paymentContent,
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

    if (!result.paymentUrl && !result.paymentContent) {
      await recordProviderCreateResult({
        orderNo,
        provider: result.provider,
        providerOrderId: result.providerOrderId,
        rawResponse: result.rawResponse || null,
        paymentUrl: null,
      });

      return NextResponse.json(
        {
          error: result.error || "支付订单创建成功，但未返回支付跳转地址",
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
      paymentUrl: result.paymentUrl || null,
    });

    return NextResponse.json({
      type: result.paymentUrl ? "redirect" : result.paymentContentType || "content",
      provider: result.provider,
      payment_url: result.paymentUrl || null,
      alipay_scheme: result.alipayScheme || null,
      fallback_url: result.fallbackUrl || null,
      payment_content: result.paymentContent || result.paymentUrl || null,
      payment_content_type: result.paymentContentType || (result.paymentUrl ? "url" : null),
      order_no: orderNo,
      provider_order_id: result.providerOrderId || null,
      raw_response: result.rawResponse,
      ...(debug ? { debug } : {}),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "数据服务未配置或支付订单创建失败，请联系管理员",
        debug: error instanceof Error ? error.message : "unknown error",
      },
      { status: 500 },
    );
  }
}
