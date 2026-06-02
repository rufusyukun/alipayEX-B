import { RechargeOrder } from "@/lib/recharge-store";

export type PaymentProviderName = "unified_order" | "alipay_official" | "mock";

export type CreatePaymentResult = {
  configured: boolean;
  provider: PaymentProviderName;
  paymentUrl?: string;
  providerOrderId?: string | null;
  rawResponse?: unknown;
  missing?: string[];
  error?: string;
};

export type PaymentProvider = {
  name: PaymentProviderName;
  createPayment(order: RechargeOrder): Promise<CreatePaymentResult>;
};
