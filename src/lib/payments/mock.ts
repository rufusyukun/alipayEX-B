import { PaymentProvider } from "@/lib/payments/types";

export const mockProvider: PaymentProvider = {
  name: "mock",
  async createPayment(order) {
    return {
      configured: true,
      provider: "mock",
      paymentUrl: `/pay/${encodeURIComponent(order.order_no)}`,
    };
  },
};
