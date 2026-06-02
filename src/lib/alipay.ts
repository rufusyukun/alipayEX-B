import { createSign, createVerify } from "crypto";
import { RechargeOrder } from "@/lib/recharge-store";

export type AlipayNotifyPayload = Record<string, string>;

type AlipayConfig = {
  appId: string;
  privateKey: string;
  publicKey: string;
  gatewayUrl: string;
  notifyUrl: string;
  returnUrl: string;
  signType: string;
  charset: string;
  format: string;
  productCode: string;
};

function normalizeKey(key: string, type: "PRIVATE" | "PUBLIC") {
  const trimmed = key.trim();

  if (trimmed.includes("BEGIN")) {
    return trimmed.replace(/\\n/g, "\n");
  }

  const body = trimmed.match(/.{1,64}/g)?.join("\n") || trimmed;
  return `-----BEGIN ${type} KEY-----\n${body}\n-----END ${type} KEY-----`;
}

export function getAlipayConfig() {
  const config: AlipayConfig = {
    appId: process.env.ALIPAY_APP_ID || "",
    privateKey: process.env.ALIPAY_PRIVATE_KEY || "",
    publicKey: process.env.ALIPAY_PUBLIC_KEY || "",
    gatewayUrl: process.env.ALIPAY_GATEWAY_URL || "",
    notifyUrl: process.env.ALIPAY_NOTIFY_URL || "",
    returnUrl: process.env.ALIPAY_RETURN_URL || "",
    signType: process.env.ALIPAY_SIGN_TYPE || "RSA2",
    charset: process.env.ALIPAY_CHARSET || "utf-8",
    format: process.env.ALIPAY_FORMAT || "JSON",
    productCode: process.env.ALIPAY_PRODUCT_CODE || "QUICK_WAP_WAY",
  };
  const missing = Object.entries(config)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  return {
    config,
    configured: missing.length === 0,
    missing,
  };
}

function sortedQuery(params: Record<string, string>, encodeValues: boolean) {
  return Object.keys(params)
    .filter((key) => params[key] !== undefined && params[key] !== "")
    .sort()
    .map((key) => `${key}=${encodeValues ? encodeURIComponent(params[key]) : params[key]}`)
    .join("&");
}

export function signAlipayParams(params: Record<string, string>, privateKey: string) {
  const sign = createSign("RSA-SHA256");
  sign.update(sortedQuery(params, false), "utf8");
  return sign.sign(normalizeKey(privateKey, "PRIVATE"), "base64");
}

export function verifyAlipayNotify(payload: AlipayNotifyPayload, publicKey: string) {
  const { sign, sign_type: _ignoredSignType, ...rest } = payload;
  void _ignoredSignType;

  if (!sign) {
    return false;
  }

  const verify = createVerify("RSA-SHA256");
  verify.update(sortedQuery(rest, false), "utf8");
  return verify.verify(normalizeKey(publicKey, "PUBLIC"), sign, "base64");
}

export function buildAlipayPaymentUrl(order: RechargeOrder) {
  const { config, configured, missing } = getAlipayConfig();

  if (!configured) {
    return {
      configured: false as const,
      missing,
      paymentUrl: "",
    };
  }

  const bizContent = JSON.stringify({
    out_trade_no: order.order_no,
    total_amount: (order.amount_cents / 100).toFixed(2),
    subject: "alipayEX 充值订单",
    product_code: config.productCode,
  });
  const params: Record<string, string> = {
    app_id: config.appId,
    method: "alipay.trade.wap.pay",
    format: config.format,
    charset: config.charset,
    sign_type: config.signType,
    timestamp: new Date().toISOString().slice(0, 19).replace("T", " "),
    version: "1.0",
    notify_url: config.notifyUrl,
    return_url: config.returnUrl,
    biz_content: bizContent,
  };
  const signature = signAlipayParams(params, config.privateKey);
  const paymentUrl = `${config.gatewayUrl}?${sortedQuery({ ...params, sign: signature }, true)}`;

  return {
    configured: true as const,
    missing: [],
    paymentUrl,
  };
}

export function centsToAlipayAmount(cents: number) {
  return (cents / 100).toFixed(2);
}
