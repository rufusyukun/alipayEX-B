import { createHash } from "crypto";
import { RechargeOrder } from "@/lib/recharge-store";
import { CreatePaymentResult, PaymentProvider } from "@/lib/payments/types";

type UnifiedOrderConfig = {
  siteUrl: string;
  gatewayUrl: string;
  createUrl: string;
  queryUrl: string;
  refundUrl: string;
  merchantId: string;
  appId: string;
  apiKey: string;
  notifyUrl: string;
  returnUrl: string;
  wayCode: string;
  channelExtra: string;
  timeoutSeconds: number;
};

type UnifiedOrderData = {
  appId?: string;
  path?: string;
  mchOrderNo?: string;
  orderState?: number | string;
  payOrderId?: string;
  payDataType?: string;
  qrUrl?: string;
  payUrl?: string;
  payData?: string;
  cashierUrl?: string;
  checkoutUrl?: string;
  codeUrl?: string;
  qrCode?: string;
  payInfo?: string;
  url?: string;
  h5Url?: string;
  data?: UnifiedOrderData;
};

type UnifiedOrderResponse = {
  code?: string | number;
  retCode?: string | number;
  msg?: string;
  retMsg?: string;
  qrUrl?: string;
  payUrl?: string;
  payData?: string;
  cashierUrl?: string;
  checkoutUrl?: string;
  codeUrl?: string;
  qrCode?: string;
  payInfo?: string;
  url?: string;
  h5Url?: string;
  data?: UnifiedOrderData | string;
  sign?: string;
};

type PaymentTarget = {
  content: string;
  alternateContent?: string;
  fallbackUrl?: string;
  type: "url" | "qr" | "content";
};

export type UnifiedOrderQueryResponse = Record<string, unknown>;

function getTimeoutSeconds() {
  const timeout = Number(process.env.UNIFIED_ORDER_TIMEOUT_SECONDS || "300");
  return Number.isFinite(timeout) ? Math.min(timeout, 300) : 300;
}

function getSiteUrl() {
  const siteUrl =
    process.env.APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "https://www.chongzhicenter.com";

  return siteUrl.replace(/\/$/, "");
}

export function getUnifiedOrderConfig() {
  const gatewayUrl = process.env.UNIFIED_ORDER_GATEWAY_URL || "https://gateway.sxdwc.fun";
  const siteUrl = getSiteUrl();
  const config: UnifiedOrderConfig = {
    siteUrl,
    gatewayUrl,
    createUrl:
      process.env.UNIFIED_ORDER_CREATE_URL || `${gatewayUrl.replace(/\/$/, "")}/api/pay/unifiedOrder`,
    queryUrl: process.env.UNIFIED_ORDER_QUERY_URL || `${gatewayUrl.replace(/\/$/, "")}/api/pay/query`,
    refundUrl:
      process.env.UNIFIED_ORDER_REFUND_URL || `${gatewayUrl.replace(/\/$/, "")}/api/refund/refundOrder`,
    merchantId: process.env.UNIFIED_ORDER_MERCHANT_ID || "",
    appId: process.env.UNIFIED_ORDER_APP_ID || "",
    apiKey: process.env.UNIFIED_ORDER_API_KEY || "",
    notifyUrl: process.env.UNIFIED_ORDER_NOTIFY_URL || `${siteUrl}/api/alipay/notify`,
    returnUrl: process.env.UNIFIED_ORDER_RETURN_URL || `${siteUrl}/success`,
    wayCode: process.env.UNIFIED_ORDER_PAY_WAY_CODE || "ALI_WAP",
    channelExtra: process.env.UNIFIED_ORDER_CHANNEL_EXTRA || '{"payDataType":"payUrl"}',
    timeoutSeconds: getTimeoutSeconds(),
  };
  const missing = [
    ["merchantId", config.merchantId],
    ["appId", config.appId],
    ["apiKey", config.apiKey],
    ["notifyUrl", config.notifyUrl],
    ["returnUrl", config.returnUrl],
  ]
    .filter(([, value]) => !value)
    .map(([key]) => key);

  return {
    config,
    configured: missing.length === 0,
    missing,
  };
}

function stringifySignValue(value: unknown) {
  if (typeof value === "object" && value !== null) {
    return JSON.stringify(value);
  }

  return String(value);
}

export function buildUnifiedOrderSignString(params: Record<string, unknown>, privateKey: string) {
  const filteredParams = Object.keys(params)
    .filter((key) => params[key] !== "" && key !== "sign" && key !== "signValue")
    .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
    .reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = params[key];
      return acc;
    }, {});

  const stringA = Object.entries(filteredParams)
    .map(([key, value]) => `${key}=${stringifySignValue(value)}`)
    .join("&");

  return `${stringA}&key=${privateKey}`;
}

export function generateUnifiedOrderSign(params: Record<string, unknown>, privateKey: string) {
  const stringSignTemp = buildUnifiedOrderSignString(params, privateKey);

  if (process.env.NODE_ENV === "development") {
    const masked = privateKey ? `${privateKey.slice(0, 4)}...${privateKey.slice(-4)}` : "";
    console.info(
      `[unified_order] signing ${Object.keys(params).length} params with masked key ${masked}`,
    );
  }

  return createHash("md5").update(stringSignTemp, "utf8").digest("hex").toUpperCase();
}

export const signParams = generateUnifiedOrderSign;

function formatBodyAmount(cents: number) {
  return `账户充值 ¥${(cents / 100).toLocaleString("zh-CN", {
    maximumFractionDigits: 2,
  })}`;
}

function buildReturnUrl(returnUrl: string, orderNo: string) {
  try {
    const url = new URL(returnUrl);
    url.searchParams.set("orderNo", orderNo);
    return url.toString();
  } catch {
    const separator = returnUrl.includes("?") ? "&" : "?";
    return `${returnUrl}${separator}orderNo=${encodeURIComponent(orderNo)}`;
  }
}

function buildCreatePayload(order: RechargeOrder, config: UnifiedOrderConfig) {
  const returnUrl = buildReturnUrl(config.returnUrl, order.order_no);
  const payload: Record<string, unknown> = {
    mchNo: config.merchantId,
    appId: config.appId,
    mchOrderNo: order.order_no,
    wayCode: config.wayCode,
    amount: order.amount_cents,
    currency: "cny",
    clientIp: order.client_ip || "",
    subject: "账户充值",
    body: formatBodyAmount(order.amount_cents),
    notifyUrl: config.notifyUrl,
    returnUrl,
    expiredTime: config.timeoutSeconds,
    channelExtra: config.channelExtra,
    divisionMode: 1,
    extParam: order.phone || "",
    reqTime: Date.now(),
    version: "1.0",
    signType: "MD5",
  };

  return {
    ...payload,
    sign: generateUnifiedOrderSign(payload, config.apiKey),
  };
}

function logCreatePayload(payload: Record<string, unknown>, config: UnifiedOrderConfig) {
  const signParamKeys = Object.keys(payload)
    .filter((key) => key !== "sign" && key !== "signValue" && payload[key] !== "")
    .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

  console.info("[unified_order] create request urls", {
    notifyUrl: payload.notifyUrl,
    returnUrl: payload.returnUrl,
    siteUrl: config.siteUrl,
  });

  console.info("[unified_order] create payment payload", {
    createUrl: config.createUrl,
    provider: "unified_order",
    notifyUrl: payload.notifyUrl,
    returnUrl: payload.returnUrl,
    wayCode: payload.wayCode,
    channelExtra: payload.channelExtra,
    amount: payload.amount,
    currency: payload.currency,
    mchOrderNo: payload.mchOrderNo,
    expiredTime: payload.expiredTime,
    payloadKeys: Object.keys(payload).sort(),
    signParamKeys,
    notifyUrlInPayload: Object.prototype.hasOwnProperty.call(payload, "notifyUrl"),
    notifyUrlInSignedParams: signParamKeys.includes("notifyUrl"),
    hasMchNo: Boolean(payload.mchNo),
    hasAppId: Boolean(payload.appId),
    hasApiKey: Boolean(config.apiKey),
    hasSign: Boolean(payload.sign),
  });

  if (process.env.NODE_ENV === "production") {
    const notifyUrl = String(payload.notifyUrl || "");
    const expectedNotifyUrl = process.env.EXPECTED_NOTIFY_URL || "";

    if (expectedNotifyUrl && notifyUrl !== expectedNotifyUrl) {
      console.warn("[unified_order] notifyUrl is not the expected production callback URL", {
        notifyUrl,
        expectedNotifyUrl,
      });
    }
  }
}

function responseData(response: UnifiedOrderResponse): UnifiedOrderData {
  return typeof response.data === "object" && response.data !== null ? response.data : {};
}

function isSuccessfulResponse(response: UnifiedOrderResponse) {
  const code = response.code ?? response.retCode;
  const codeText = String(code ?? "").toUpperCase();
  const message = String(response.msg || response.retMsg || "").toUpperCase();

  return code === 0 || code === "0" || codeText === "SUCCESS" || message === "SUCCESS";
}

function isUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

function buildAlipaySchemes(input: { appId?: string; path?: string; qrUrl?: string }) {
  if (!input.appId || !input.path || !input.qrUrl) {
    return null;
  }

  const pageWithQrUrl = `${input.path}?qrUrl=${encodeURIComponent(input.qrUrl)}`;

  return {
    primary: `alipays://platformapi/startapp?appId=${input.appId}&page=${encodeURIComponent(
      input.path,
    )}&query=qrCode=${encodeURIComponent(input.qrUrl)}`,
    alternate: `alipays://platformapi/startapp?appId=${input.appId}&page=${encodeURIComponent(
      pageWithQrUrl,
    )}`,
  };
}

function parseJsonObject(value: string): UnifiedOrderData | null {
  const trimmed = value.trim();

  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return typeof parsed === "object" && parsed !== null ? (parsed as UnifiedOrderData) : null;
  } catch {
    return null;
  }
}

function paymentFieldsFromObject(value: UnifiedOrderData) {
  return [
    value.qrUrl,
    value.payUrl,
    value.cashierUrl,
    value.checkoutUrl,
    value.url,
    value.h5Url,
    value.codeUrl,
    value.qrCode,
    value.payInfo,
    value.data?.qrUrl,
    value.data?.payUrl,
    value.data?.cashierUrl,
    value.data?.checkoutUrl,
    value.data?.url,
    value.data?.h5Url,
    value.data?.codeUrl,
    value.data?.qrCode,
    value.data?.payInfo,
  ].filter((field): field is string => typeof field === "string" && field.trim().length > 0);
}

function extractMiniAppTarget(value: UnifiedOrderData | null): PaymentTarget | null {
  if (!value) {
    return null;
  }

  const schemes = buildAlipaySchemes({
    appId: value.appId,
    path: value.path,
    qrUrl: value.qrUrl,
  });

  if (schemes && value.qrUrl) {
    return {
      content: schemes.primary,
      alternateContent: schemes.alternate,
      fallbackUrl: value.qrUrl,
      type: "url" as const,
    };
  }

  return value.data ? extractMiniAppTarget(value.data) : null;
}

function extractPaymentTarget(response: UnifiedOrderResponse) {
  const data = responseData(response);
  const miniAppTarget =
    extractMiniAppTarget(typeof data.payData === "string" ? parseJsonObject(data.payData) : null) ||
    extractMiniAppTarget(data) ||
    extractMiniAppTarget(typeof response.data === "string" ? parseJsonObject(response.data) : null);

  if (miniAppTarget) {
    return miniAppTarget;
  }

  const candidates = [
    response.qrUrl,
    response.payUrl,
    response.cashierUrl,
    response.checkoutUrl,
    response.url,
    response.h5Url,
    response.codeUrl,
    response.payData,
    response.qrCode,
    response.payInfo,
    typeof response.data === "string" ? response.data : "",
    ...paymentFieldsFromObject(data),
    data.payUrl,
    data.cashierUrl,
    data.checkoutUrl,
    data.codeUrl,
    data.payData,
    data.qrCode,
    data.payInfo,
  ].filter((value): value is string => typeof value === "string" && value.trim().length > 0);

  const url = candidates.find((value) => isUrl(value.trim()));
  if (url) {
    return {
      content: url.trim(),
      fallbackUrl: url.trim(),
      type: "url" as const,
    };
  }

  for (const candidate of candidates) {
    const parsed = parseJsonObject(candidate);
    if (!parsed) {
      continue;
    }

    const parsedUrl = paymentFieldsFromObject(parsed).find((value) => isUrl(value.trim()));
    if (parsedUrl) {
      return {
        content: parsedUrl.trim(),
        fallbackUrl: parsedUrl.trim(),
        type: "url" as const,
      };
    }
  }

  const content = candidates[0]?.trim();
  if (!content) {
    return null;
  }

  const payDataType = String(data.payDataType || "").toLowerCase();

  return {
    content,
    type: (payDataType.includes("qr") ? "qr" : "content") as "qr" | "content",
  };
}

async function postUnifiedOrder(
  order: RechargeOrder,
  config: UnifiedOrderConfig,
): Promise<UnifiedOrderResponse> {
  const payload = buildCreatePayload(order, config);
  logCreatePayload(payload, config);

  const response = await fetch(config.createUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return (await response.json()) as UnifiedOrderResponse;
}

function logUnifiedOrderResponse(response: UnifiedOrderResponse) {
  console.info("[unified_order] create payment raw response", response);
}

export async function queryUnifiedOrder(input: string | { orderNo?: string; providerOrderId?: string | null }) {
  const { config, configured, missing } = getUnifiedOrderConfig();
  const orderNo = typeof input === "string" ? input : input.orderNo || "";
  const providerOrderId = typeof input === "string" ? "" : input.providerOrderId || "";

  if (!configured) {
    return {
      configured: false,
      missing,
      rawResponse: null,
    };
  }

  const payload: Record<string, unknown> = {
    // TODO: Confirm exact query request fields from InoPay query docs.
    mchNo: config.merchantId,
    appId: config.appId,
    ...(providerOrderId ? { payOrderId: providerOrderId } : { mchOrderNo: orderNo }),
    reqTime: Date.now(),
    version: "1.0",
    signType: "MD5",
  };

  console.info("[unified_order] query payment payload", {
    queryUrl: config.queryUrl,
    localOrderNo: orderNo || null,
    providerOrderIdPresent: Boolean(providerOrderId),
    queryBy: providerOrderId ? "payOrderId" : "mchOrderNo",
    mchOrderNo: payload.mchOrderNo || null,
    payOrderId: payload.payOrderId || null,
    payloadKeys: Object.keys(payload).sort(),
    hasMchNo: Boolean(payload.mchNo),
    hasAppId: Boolean(payload.appId),
    hasApiKey: Boolean(config.apiKey),
  });

  const response = await fetch(config.queryUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ...payload,
      sign: generateUnifiedOrderSign(payload, config.apiKey),
    }),
  });

  return {
    configured: true,
    missing: [],
    rawResponse: (await response.json()) as UnifiedOrderQueryResponse,
  };
}

export const unifiedOrderProvider: PaymentProvider = {
  name: "unified_order",
  async createPayment(order): Promise<CreatePaymentResult> {
    const { config, configured, missing } = getUnifiedOrderConfig();

    if (!configured) {
      return {
        configured: false,
        provider: "unified_order",
        missing,
        error: "支付接口未配置，请联系管理员",
      };
    }

    const response = await postUnifiedOrder(order, config);
    logUnifiedOrderResponse(response);

    if (!isSuccessfulResponse(response)) {
      return {
        configured: true,
        provider: "unified_order",
        rawResponse: response,
        error: response.msg || response.retMsg || "统一下单失败",
      };
    }

    const paymentTarget = extractPaymentTarget(response);
    if (!paymentTarget) {
      return {
        configured: true,
        provider: "unified_order",
        rawResponse: response,
        error: "支付订单创建成功，但未返回支付跳转地址",
      };
    }

    const data = responseData(response);

    return {
      configured: true,
      provider: "unified_order",
      paymentUrl: paymentTarget.type === "url" ? paymentTarget.content : undefined,
      alipayScheme: paymentTarget.content.startsWith("alipays://") ? paymentTarget.content : undefined,
      alipaySchemeAlt: paymentTarget.alternateContent?.startsWith("alipays://")
        ? paymentTarget.alternateContent
        : undefined,
      fallbackUrl: paymentTarget.fallbackUrl,
      paymentContent: paymentTarget.content,
      paymentContentType: paymentTarget.type,
      providerOrderId: data.payOrderId,
      rawResponse: {
        code: response.code,
        retCode: response.retCode,
        msg: response.msg,
        retMsg: response.retMsg,
        qrUrl: response.qrUrl,
        payUrl: response.payUrl,
        payData: response.payData,
        cashierUrl: response.cashierUrl,
        checkoutUrl: response.checkoutUrl,
        codeUrl: response.codeUrl,
        qrCode: response.qrCode,
        payInfo: response.payInfo,
        url: response.url,
        h5Url: response.h5Url,
        data,
        sign: response.sign,
      },
    };
  },
};
