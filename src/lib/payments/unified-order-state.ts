type UnifiedOrderRaw = {
  code?: string | number;
  msg?: string;
  state?: string | number;
  orderState?: string | number;
  status?: string | number;
  payStatus?: string | number;
  tradeState?: string | number;
  tradeStatus?: string | number;
  successTime?: string;
  paidAt?: string;
  payOrderId?: string;
  provider_order_id?: string;
  trade_no?: string;
  tradeNo?: string;
  data?: Record<string, unknown>;
};

function readString(payload: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = payload[key];
    if (value !== undefined && value !== null && String(value) !== "") {
      return String(value);
    }
  }

  return "";
}

export function parseUnifiedOrderState(rawResponse: unknown) {
  const raw = (rawResponse || {}) as UnifiedOrderRaw;
  const data = (raw.data || {}) as Record<string, unknown>;
  const root = raw as unknown as Record<string, unknown>;
  const orderState =
    readString(data, ["orderState", "state", "status", "payStatus", "tradeState", "tradeStatus"]) ||
    readString(root, ["orderState", "state", "status", "payStatus", "tradeState", "tradeStatus"]);
  const providerOrderId =
    readString(data, ["payOrderId", "provider_order_id", "trade_no", "tradeNo"]) ||
    readString(root, ["payOrderId", "provider_order_id", "trade_no", "tradeNo"]);
  const paidAt =
    readString(data, ["successTime", "paidAt", "paid_at", "paySuccessTime"]) ||
    readString(root, ["successTime", "paidAt", "paid_at", "paySuccessTime"]);

  const map: Record<string, { status: string; label: string }> = {
    "0": { status: "pending", label: "created" },
    "1": { status: "pending", label: "paying" },
    "2": { status: "paid", label: "paid" },
    "3": { status: "failed", label: "failed" },
    "4": { status: "closed", label: "cancelled" },
    "5": { status: "refunded", label: "refunded" },
    "6": { status: "closed", label: "expired" },
  };
  const mapped = map[orderState] || { status: "pending", label: orderState || "unknown" };

  return {
    orderState,
    stateLabel: mapped.label,
    paymentStatus: mapped.status as "pending" | "paid" | "failed" | "closed" | "refunded",
    providerOrderId,
    paidAt,
    querySucceeded: raw.code === 0 || raw.code === "0",
    isPaid: orderState === "2",
    isTerminal: ["2", "3", "4", "5", "6"].includes(orderState),
  };
}
