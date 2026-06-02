import { createHash } from "crypto";
import { RechargeOrder } from "@/lib/recharge-store";
import { CreatePaymentResult, PaymentProvider } from "@/lib/payments/types";

type UnifiedOrderConfig = {
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

type UnifiedOrderResponse = {
  code?: string | number;
  msg?: string;
  data?: {
    mchOrderNo?: string;
    orderState?: number | string;
    payData?: string;
    payDataType?: string;
    payOrderId?: string;
  };
  sign?: string;
};

export type UnifiedOrderQueryResponse = Record<string, unknown>;

function getTimeoutSeconds() {
  const timeout = Number(process.env.UNIFIED_ORDER_TIMEOUT_SECONDS || "300");
  return Number.isFinite(timeout) ? Math.min(timeout, 300) : 300;
}

export function getUnifiedOrderConfig() {
  const gatewayUrl = process.env.UNIFIED_ORDER_GATEWAY_URL || "https://gateway.sxdwc.fun";
  const config: UnifiedOrderConfig = {
    gatewayUrl,
    createUrl:
      process.env.UNIFIED_ORDER_CREATE_URL || `${gatewayUrl.replace(/\/$/, "")}/api/pay/unifiedOrder`,
    queryUrl: process.env.UNIFIED_ORDER_QUERY_URL || `${gatewayUrl.replace(/\/$/, "")}/api/pay/query`,
    refundUrl:
      process.env.UNIFIED_ORDER_REFUND_URL || `${gatewayUrl.replace(/\/$/, "")}/api/refund/refundOrder`,
    merchantId: process.env.UNIFIED_ORDER_MERCHANT_ID || "",
    appId: process.env.UNIFIED_ORDER_APP_ID || "",
    apiKey: process.env.UNIFIED_ORDER_API_KEY || "",
    notifyUrl: process.env.UNIFIED_ORDER_NOTIFY_URL || "",
    returnUrl: process.env.UNIFIED_ORDER_RETURN_URL || "",
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

function isSuccessfulCode(code: string | number | undefined) {
  return code === 0 || code === "0";
}

function isUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

function extractPaymentUrl(response: UnifiedOrderResponse) {
  const payData = response.data?.payData || "";
  const payDataType = response.data?.payDataType || "";

  if (payData && (payDataType === "payUrl" || isUrl(payData))) {
    return payData;
  }

  return "";
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

export async function queryUnifiedOrder(orderNo: string) {
  const { config, configured, missing } = getUnifiedOrderConfig();

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
    mchOrderNo: orderNo,
    reqTime: Date.now(),
    version: "1.0",
    signType: "MD5",
  };

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
    const paymentUrl = extractPaymentUrl(response);

    if (!isSuccessfulCode(response.code) || !paymentUrl) {
      return {
        configured: true,
        provider: "unified_order",
        rawResponse: response,
        error: response.msg || "统一下单未返回可跳转的支付链接",
      };
    }

    return {
      configured: true,
      provider: "unified_order",
      paymentUrl,
      providerOrderId: response.data?.payOrderId,
      rawResponse: {
        code: response.code,
        msg: response.msg,
        mchOrderNo: response.data?.mchOrderNo,
        orderState: response.data?.orderState,
        payData: response.data?.payData,
        payDataType: response.data?.payDataType,
        payOrderId: response.data?.payOrderId,
        sign: response.sign,
      },
    };
  },
};
