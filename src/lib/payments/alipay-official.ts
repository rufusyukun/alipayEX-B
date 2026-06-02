import { buildAlipayPaymentUrl } from "@/lib/alipay";
import { PaymentProvider } from "@/lib/payments/types";

export const alipayOfficialProvider: PaymentProvider = {
  name: "alipay_official",
  async createPayment(order) {
    const result = buildAlipayPaymentUrl(order);

    if (!result.configured) {
      return {
        configured: false,
        provider: "alipay_official",
        missing: result.missing,
        error: "支付接口未配置，请联系管理员",
      };
    }

    return {
      configured: true,
      provider: "alipay_official",
      paymentUrl: result.paymentUrl,
    };
  },
};
