import { alipayOfficialProvider } from "@/lib/payments/alipay-official";
import { mockProvider } from "@/lib/payments/mock";
import { PaymentProviderName } from "@/lib/payments/types";
import { unifiedOrderProvider } from "@/lib/payments/unified-order";

export function getPaymentProviderName(): PaymentProviderName {
  const value = process.env.PAYMENT_PROVIDER || "unified_order";

  if (value === "mock" || value === "alipay_official" || value === "unified_order") {
    return value;
  }

  return "unified_order";
}

export function getPaymentProvider() {
  const provider = getPaymentProviderName();

  if (provider === "mock") {
    return mockProvider;
  }

  if (provider === "alipay_official") {
    return alipayOfficialProvider;
  }

  return unifiedOrderProvider;
}
