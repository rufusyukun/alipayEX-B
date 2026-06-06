import { RechargeOrder } from "@/lib/recharge-store";

export type PaymentProviderName = "unified_order" | "alipay_official" | "mock";

export type CreatePaymentResult = {
  configured: boolean;
  provider: PaymentProviderName;
  paymentUrl?: string;
  alipayScheme?: string;
  alipaySchemeAlt?: string;
  androidIntentUrl?: string;
  fallbackUrl?: string;
  appId?: string;
  path?: string;
  qrUrl?: string;
  jeepayToken?: string;
  paymentContent?: string;
  paymentContentType?: "url" | "qr" | "content";
  providerOrderId?: string | null;
  rawResponse?: unknown;
  missing?: string[];
  error?: string;
};

export type PaymentProvider = {
  name: PaymentProviderName;
  createPayment(order: RechargeOrder): Promise<CreatePaymentResult>;
};
