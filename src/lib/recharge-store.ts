import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { getSupabaseAdminClient, hasSupabaseAdminConfig } from "@/lib/supabase";

export type PaymentStatus = "pending" | "paying" | "paid" | "failed" | "closed" | "refunded";
export type SupportStatus = "unprocessed" | "processing" | "completed" | "disputed";

type DbCustomerStatus = "pending" | "processing" | "completed" | "disputed";

export type RechargeOrder = {
  id: string;
  order_no: string;
  amount_cents: number;
  currency: "cny" | "CNY";
  payment_method: "alipay";
  payment_provider: string;
  payment_status: PaymentStatus;
  phone: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
  support_status: SupportStatus;
  support_note: string | null;
  mock_trade_no: string | null;
  alipay_trade_no: string | null;
  provider_order_id: string | null;
  provider_raw_response: unknown;
  notify_sign_verified: boolean | null;
  client_ip: string | null;
  user_agent: string | null;
};

export type PaymentEvent = {
  id: string;
  order_no: string;
  provider?: string;
  event_type: string;
  event_status?: string | null;
  trade_status: string;
  raw_payload: unknown;
  sign_verified?: boolean | null;
  received_at: string;
  created_at?: string;
  process_result: string;
};

export type SupportOperation = {
  id: string;
  order_no: string;
  action: string;
  created_at: string;
};

type StoreData = {
  orders: RechargeOrder[];
  payment_events: PaymentEvent[];
  support_operations: SupportOperation[];
};

type DbRechargeOrder = {
  id: string;
  order_no: string;
  amount_cents: number;
  currency: "cny" | "CNY";
  phone: string | null;
  payment_method: "alipay";
  provider: string | null;
  provider_order_id: string | null;
  payment_status: PaymentStatus;
  customer_status: DbCustomerStatus | null;
  support_note: string | null;
  raw_response: unknown;
  mock_trade_no: string | null;
  alipay_trade_no: string | null;
  notify_sign_verified: boolean | null;
  client_ip: string | null;
  user_agent: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
};

type DbPaymentEvent = {
  id: string;
  order_no: string;
  provider: string | null;
  event_type: string | null;
  event_status: string | null;
  trade_status: string | null;
  sign_verified: boolean | null;
  raw_payload: unknown;
  process_result: string | null;
  received_at: string | null;
  created_at: string;
};

export type OrderFilters = {
  orderNo?: string;
  phone?: string;
  paymentStatus?: PaymentStatus | "all";
  supportStatus?: SupportStatus | "all";
  dateFrom?: string;
  dateTo?: string;
};

declare global {
  var __alipayexRechargeStore: StoreData | undefined;
}

const dataDir = path.join(process.cwd(), "data");
const dataFile = path.join(dataDir, "recharge-orders.json");

const emptyData: StoreData = {
  orders: [],
  payment_events: [],
  support_operations: [],
};

function shouldUseSupabase() {
  return hasSupabaseAdminConfig() || process.env.NODE_ENV === "production";
}

function assertSupabaseConfigured() {
  if (!hasSupabaseAdminConfig()) {
    throw new Error("数据库未配置，请联系管理员");
  }
}

function dbCustomerStatusToSupport(value: DbCustomerStatus | null): SupportStatus {
  return value === "pending" || !value ? "unprocessed" : value;
}

function supportStatusToDb(value: SupportStatus): DbCustomerStatus {
  return value === "unprocessed" ? "pending" : value;
}

function mapDbOrder(row: DbRechargeOrder): RechargeOrder {
  return {
    id: row.id,
    order_no: row.order_no,
    amount_cents: row.amount_cents,
    currency: row.currency,
    payment_method: row.payment_method,
    payment_provider: row.provider || "unified_order",
    payment_status: row.payment_status,
    phone: row.phone,
    paid_at: row.paid_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    support_status: dbCustomerStatusToSupport(row.customer_status),
    support_note: row.support_note,
    mock_trade_no: row.mock_trade_no,
    alipay_trade_no: row.alipay_trade_no,
    provider_order_id: row.provider_order_id,
    provider_raw_response: row.raw_response,
    notify_sign_verified: row.notify_sign_verified,
    client_ip: row.client_ip,
    user_agent: row.user_agent,
  };
}

function mapDbEvent(row: DbPaymentEvent): PaymentEvent {
  return {
    id: row.id,
    order_no: row.order_no,
    provider: row.provider || "unified_order",
    event_type: row.event_type || "",
    event_status: row.event_status,
    trade_status: row.trade_status || row.event_status || "",
    raw_payload: row.raw_payload,
    sign_verified: row.sign_verified,
    received_at: row.received_at || row.created_at,
    created_at: row.created_at,
    process_result: row.process_result || "",
  };
}

async function readLocalStore(): Promise<StoreData> {
  if (globalThis.__alipayexRechargeStore) {
    return globalThis.__alipayexRechargeStore;
  }

  try {
    const raw = await readFile(dataFile, "utf8");
    const parsed = JSON.parse(raw) as Partial<StoreData>;
    const data = {
      orders: Array.isArray(parsed.orders) ? parsed.orders : [],
      payment_events: Array.isArray(parsed.payment_events) ? parsed.payment_events : [],
      support_operations: Array.isArray(parsed.support_operations)
        ? parsed.support_operations
        : [],
    };
    globalThis.__alipayexRechargeStore = data;
    return data;
  } catch {
    const data = structuredClone(emptyData);
    globalThis.__alipayexRechargeStore = data;
    return data;
  }
}

async function writeLocalStore(data: StoreData) {
  globalThis.__alipayexRechargeStore = data;

  try {
    await mkdir(dataDir, { recursive: true });
    await writeFile(dataFile, JSON.stringify(data, null, 2), "utf8");
  } catch (error) {
    console.error("development recharge JSON store write failed", error);
  }
}

async function readStore(): Promise<StoreData> {
  return readLocalStore();
}

async function writeStore(data: StoreData) {
  return writeLocalStore(data);
}

function createId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
}

function getClientIp(request: Request) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    null
  );
}

export async function createRechargeOrder(input: {
  orderNo: string;
  amountCents: number;
  phone: string | null;
  request: Request;
}) {
  if (shouldUseSupabase()) {
    assertSupabaseConfigured();
    const supabase = getSupabaseAdminClient();
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("recharge_orders")
      .insert({
        order_no: input.orderNo,
        amount_cents: input.amountCents,
        currency: "cny",
        payment_method: "alipay",
        provider: "unified_order",
        payment_status: "pending",
        customer_status: "pending",
        phone: input.phone || null,
        client_ip: getClientIp(input.request),
        user_agent: input.request.headers.get("user-agent"),
        created_at: now,
        updated_at: now,
      })
      .select("*")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    await recordPaymentEvent({
      orderNo: input.orderNo,
      eventType: "order_created",
      tradeStatus: "pending",
      rawPayload: { amount_cents: input.amountCents, phone: input.phone || null },
      processResult: "created",
      signVerified: null,
    });

    return mapDbOrder(data as DbRechargeOrder);
  }

  const data = await readStore();
  const now = new Date().toISOString();
  const order: RechargeOrder = {
    id: createId("ord"),
    order_no: input.orderNo,
    amount_cents: input.amountCents,
    currency: "cny",
    payment_method: "alipay",
    payment_provider: "unified_order",
    payment_status: "pending",
    phone: input.phone || null,
    paid_at: null,
    created_at: now,
    updated_at: now,
    support_status: "unprocessed",
    support_note: null,
    mock_trade_no: null,
    alipay_trade_no: null,
    provider_order_id: null,
    provider_raw_response: null,
    notify_sign_verified: null,
    client_ip: getClientIp(input.request),
    user_agent: input.request.headers.get("user-agent"),
  };

  data.orders.push(order);
  data.payment_events.push({
    id: createId("evt"),
    order_no: input.orderNo,
    provider: "unified_order",
    event_type: "order_created",
    event_status: "pending",
    trade_status: "pending",
    raw_payload: { amount_cents: input.amountCents, phone: input.phone || null },
    sign_verified: null,
    received_at: now,
    created_at: now,
    process_result: "created",
  });
  await writeStore(data);

  return order;
}

export async function markMockPaid(orderNo: string, rawPayload: unknown) {
  if (shouldUseSupabase()) {
    assertSupabaseConfigured();
    const supabase = getSupabaseAdminClient();
    const now = new Date().toISOString();
    const mockTradeNo = `MOCK${Date.now()}${Math.floor(Math.random() * 900 + 100)}`;
    const { data, error } = await supabase
      .from("recharge_orders")
      .update({
        payment_status: "paid",
        paid_at: now,
        updated_at: now,
        mock_trade_no: mockTradeNo,
      })
      .eq("order_no", orderNo)
      .select("*")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    await recordPaymentEvent({
      orderNo,
      eventType: "mock_pay",
      tradeStatus: "paid",
      rawPayload,
      processResult: "mock_paid",
      signVerified: null,
    });

    return mapDbOrder(data as DbRechargeOrder);
  }

  const data = await readStore();
  const order = data.orders.find((item) => item.order_no === orderNo);

  if (!order) {
    return null;
  }

  const now = new Date().toISOString();
  const tradeNo = order.mock_trade_no || `MOCK${Date.now()}${Math.floor(Math.random() * 900 + 100)}`;
  order.payment_status = "paid";
  order.paid_at = order.paid_at || now;
  order.updated_at = now;
  order.mock_trade_no = tradeNo;

  data.payment_events.push({
    id: createId("evt"),
    order_no: orderNo,
    provider: "mock",
    event_type: "mock_pay",
    event_status: "paid",
    trade_status: "paid",
    raw_payload: rawPayload,
    sign_verified: null,
    received_at: now,
    created_at: now,
    process_result: "mock_paid",
  });
  await writeStore(data);

  return order;
}

export async function recordPaymentEvent(input: {
  orderNo: string;
  eventType: string;
  tradeStatus: string;
  rawPayload: unknown;
  processResult: string;
  signVerified?: boolean | null;
}) {
  if (shouldUseSupabase()) {
    assertSupabaseConfigured();
    const supabase = getSupabaseAdminClient();
    const now = new Date().toISOString();
    const { error } = await supabase.from("payment_events").insert({
      order_no: input.orderNo,
      provider: "unified_order",
      event_type: input.eventType,
      event_status: input.tradeStatus,
      trade_status: input.tradeStatus,
      raw_payload: input.rawPayload,
      sign_verified: input.signVerified ?? false,
      process_result: input.processResult,
      received_at: now,
      created_at: now,
    });

    if (error) {
      throw new Error(error.message);
    }
    return;
  }

  const data = await readStore();
  const now = new Date().toISOString();

  data.payment_events.push({
    id: createId("evt"),
    order_no: input.orderNo,
    provider: "unified_order",
    event_type: input.eventType,
    event_status: input.tradeStatus,
    trade_status: input.tradeStatus,
    raw_payload: input.rawPayload,
    sign_verified: input.signVerified ?? null,
    received_at: now,
    created_at: now,
    process_result: input.processResult,
  });
  await writeStore(data);
}

export async function recordProviderCreateResult(input: {
  orderNo: string;
  provider: string;
  providerOrderId?: string | null;
  rawResponse: unknown;
  paymentUrl?: string | null;
}) {
  if (shouldUseSupabase()) {
    assertSupabaseConfigured();
    const supabase = getSupabaseAdminClient();
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("recharge_orders")
      .update({
        provider: input.provider,
        provider_order_id: input.providerOrderId || null,
        raw_response: input.rawResponse,
        updated_at: now,
      })
      .eq("order_no", input.orderNo)
      .select("*")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    await recordPaymentEvent({
      orderNo: input.orderNo,
      eventType: "create_order",
      tradeStatus: input.paymentUrl ? "payment_url_created" : "payment_url_missing",
      rawPayload: {
        provider: input.provider,
        provider_order_id: input.providerOrderId || null,
        raw_response: input.rawResponse,
        payment_url_present: Boolean(input.paymentUrl),
      },
      processResult: input.paymentUrl ? "payment_url_created" : "payment_url_missing",
      signVerified: null,
    });

    return mapDbOrder(data as DbRechargeOrder);
  }

  const data = await readStore();
  const order = data.orders.find((item) => item.order_no === input.orderNo);
  const now = new Date().toISOString();

  if (!order) {
    return null;
  }

  order.payment_provider = input.provider;
  order.provider_order_id = input.providerOrderId || order.provider_order_id;
  order.provider_raw_response = input.rawResponse;
  order.updated_at = now;

  data.payment_events.push({
    id: createId("evt"),
    order_no: input.orderNo,
    provider: input.provider,
    event_type: "create_order",
    event_status: input.paymentUrl ? "payment_url_created" : "payment_url_missing",
    trade_status: order.payment_status,
    raw_payload: {
      provider: input.provider,
      provider_order_id: input.providerOrderId || null,
      raw_response: input.rawResponse,
      payment_url_present: Boolean(input.paymentUrl),
    },
    sign_verified: null,
    received_at: now,
    created_at: now,
    process_result: input.paymentUrl ? "payment_url_created" : "payment_url_missing",
  });

  await writeStore(data);
  return order;
}

export async function markAlipayPaid(input: {
  orderNo: string;
  alipayTradeNo: string | null;
  providerOrderId?: string | null;
  signVerified: boolean;
  paidAt?: string | null;
  rawResponse?: unknown;
}) {
  if (shouldUseSupabase()) {
    assertSupabaseConfigured();
    const supabase = getSupabaseAdminClient();
    const now = new Date().toISOString();
    const paidAt = input.paidAt || now;
    const existing = await supabase
      .from("recharge_orders")
      .select("paid_at, provider_order_id")
      .eq("order_no", input.orderNo)
      .maybeSingle();

    if (existing.error) {
      throw new Error(existing.error.message);
    }

    const { data, error } = await supabase
      .from("recharge_orders")
      .update({
        payment_status: "paid",
        paid_at: existing.data?.paid_at || paidAt,
        updated_at: now,
        notify_sign_verified: input.signVerified,
        alipay_trade_no: input.alipayTradeNo,
        provider_order_id: input.providerOrderId || existing.data?.provider_order_id || undefined,
        raw_response: input.rawResponse || undefined,
      })
      .eq("order_no", input.orderNo)
      .select("*")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return mapDbOrder(data as DbRechargeOrder);
  }

  const data = await readStore();
  const order = data.orders.find((item) => item.order_no === input.orderNo);

  if (!order) {
    return null;
  }

  const now = new Date().toISOString();
  const paidAt = input.paidAt || now;
  order.notify_sign_verified = input.signVerified;
  order.alipay_trade_no = input.alipayTradeNo;
  order.provider_order_id = input.providerOrderId || order.provider_order_id;
  order.provider_raw_response = input.rawResponse || order.provider_raw_response;

  if (order.payment_status !== "paid") {
    order.payment_status = "paid";
    order.paid_at = paidAt;
  }

  order.updated_at = now;
  await writeStore(data);
  return order;
}

export async function updatePaymentStatusFromQuery(input: {
  orderNo: string;
  paymentStatus: PaymentStatus;
  providerOrderId?: string | null;
  rawResponse?: unknown;
}) {
  if (input.paymentStatus === "paid") {
    return markAlipayPaid({
      orderNo: input.orderNo,
      alipayTradeNo: input.providerOrderId || null,
      providerOrderId: input.providerOrderId,
      rawResponse: input.rawResponse,
      signVerified: false,
    });
  }

  if (!["failed", "closed", "refunded"].includes(input.paymentStatus)) {
    return getOrder(input.orderNo);
  }

  if (shouldUseSupabase()) {
    assertSupabaseConfigured();
    const supabase = getSupabaseAdminClient();
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("recharge_orders")
      .update({
        payment_status: input.paymentStatus,
        provider_order_id: input.providerOrderId || undefined,
        raw_response: input.rawResponse || undefined,
        updated_at: now,
      })
      .eq("order_no", input.orderNo)
      .neq("payment_status", "paid")
      .select("*")
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    return data ? mapDbOrder(data as DbRechargeOrder) : getOrder(input.orderNo);
  }

  const data = await readStore();
  const order = data.orders.find((item) => item.order_no === input.orderNo);

  if (!order) {
    return null;
  }

  if (order.payment_status !== "paid") {
    order.payment_status = input.paymentStatus;
    order.provider_order_id = input.providerOrderId || order.provider_order_id;
    order.provider_raw_response = input.rawResponse || order.provider_raw_response;
    order.updated_at = new Date().toISOString();
    await writeStore(data);
  }

  return order;
}

export async function getOrder(orderNo: string) {
  if (shouldUseSupabase()) {
    assertSupabaseConfigured();
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from("recharge_orders")
      .select("*")
      .eq("order_no", orderNo)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    return data ? mapDbOrder(data as DbRechargeOrder) : null;
  }

  const data = await readStore();
  return data.orders.find((item) => item.order_no === orderNo) || null;
}

export const getRechargeOrderByNo = getOrder;

export async function getOrderByProviderOrderId(providerOrderId: string) {
  if (shouldUseSupabase()) {
    assertSupabaseConfigured();
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from("recharge_orders")
      .select("*")
      .eq("provider_order_id", providerOrderId)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    return data ? mapDbOrder(data as DbRechargeOrder) : null;
  }

  const data = await readStore();
  return data.orders.find((item) => item.provider_order_id === providerOrderId) || null;
}

export async function getOrderDetail(orderNo: string) {
  if (shouldUseSupabase()) {
    assertSupabaseConfigured();
    const supabase = getSupabaseAdminClient();
    const [orderResult, eventsResult, opsResult] = await Promise.all([
      supabase.from("recharge_orders").select("*").eq("order_no", orderNo).maybeSingle(),
      supabase
        .from("payment_events")
        .select("*")
        .eq("order_no", orderNo)
        .order("created_at", { ascending: false }),
      supabase
        .from("support_operation_logs")
        .select("*")
        .eq("order_no", orderNo)
        .order("created_at", { ascending: false }),
    ]);

    if (orderResult.error) {
      throw new Error(orderResult.error.message);
    }
    if (eventsResult.error) {
      throw new Error(eventsResult.error.message);
    }
    if (opsResult.error) {
      throw new Error(opsResult.error.message);
    }
    if (!orderResult.data) {
      return null;
    }

    return {
      order: mapDbOrder(orderResult.data as DbRechargeOrder),
      payment_events: ((eventsResult.data || []) as DbPaymentEvent[]).map(mapDbEvent),
      support_operations: (opsResult.data || []) as SupportOperation[],
    };
  }

  const data = await readStore();
  const order = data.orders.find((item) => item.order_no === orderNo);

  if (!order) {
    return null;
  }

  return {
    order,
    payment_events: data.payment_events
      .filter((item) => item.order_no === orderNo)
      .sort((a, b) => b.received_at.localeCompare(a.received_at)),
    support_operations: data.support_operations
      .filter((item) => item.order_no === orderNo)
      .sort((a, b) => b.created_at.localeCompare(a.created_at)),
  };
}

export async function listOrders(filters: OrderFilters = {}) {
  if (shouldUseSupabase()) {
    assertSupabaseConfigured();
    const supabase = getSupabaseAdminClient();
    let query = supabase.from("recharge_orders").select("*");

    if (filters.orderNo) {
      const value = filters.orderNo.replace(/[%(),]/g, "");
      query = query.or(`order_no.ilike.%${value}%,provider_order_id.ilike.%${value}%`);
    }
    if (filters.phone) {
      query = query.ilike("phone", `%${filters.phone}%`);
    }
    if (filters.paymentStatus && filters.paymentStatus !== "all") {
      query = query.eq("payment_status", filters.paymentStatus);
    }
    if (filters.supportStatus && filters.supportStatus !== "all") {
      query = query.eq("customer_status", supportStatusToDb(filters.supportStatus));
    }
    if (filters.dateFrom) {
      query = query.gte("created_at", `${filters.dateFrom}T00:00:00`);
    }
    if (filters.dateTo) {
      query = query.lte("created_at", `${filters.dateTo}T23:59:59`);
    }

    const { data, error } = await query.order("created_at", { ascending: false }).limit(500);

    if (error) {
      throw new Error(error.message);
    }

    return ((data || []) as DbRechargeOrder[]).map(mapDbOrder);
  }

  const data = await readStore();
  let orders = [...data.orders];

  if (filters.orderNo) {
    const value = filters.orderNo.toLowerCase();
    orders = orders.filter(
      (item) =>
        item.order_no.toLowerCase().includes(value) ||
        (item.provider_order_id || "").toLowerCase().includes(value),
    );
  }

  if (filters.phone) {
    orders = orders.filter((item) => (item.phone || "").includes(filters.phone || ""));
  }

  if (filters.paymentStatus && filters.paymentStatus !== "all") {
    orders = orders.filter((item) => item.payment_status === filters.paymentStatus);
  }

  if (filters.supportStatus && filters.supportStatus !== "all") {
    orders = orders.filter((item) => item.support_status === filters.supportStatus);
  }

  if (filters.dateFrom) {
    const from = new Date(`${filters.dateFrom}T00:00:00`).getTime();
    orders = orders.filter((item) => new Date(item.created_at).getTime() >= from);
  }

  if (filters.dateTo) {
    const to = new Date(`${filters.dateTo}T23:59:59`).getTime();
    orders = orders.filter((item) => new Date(item.created_at).getTime() <= to);
  }

  return orders.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export const listRechargeOrders = listOrders;

export async function updateSupport(orderNo: string, input: {
  support_status?: SupportStatus;
  support_note?: string | null;
}) {
  if (shouldUseSupabase()) {
    assertSupabaseConfigured();
    const supabase = getSupabaseAdminClient();
    const now = new Date().toISOString();
    const patch: Record<string, unknown> = { updated_at: now };

    if (input.support_status) {
      patch.customer_status = supportStatusToDb(input.support_status);
    }
    if ("support_note" in input) {
      patch.support_note = input.support_note || null;
    }

    const { data, error } = await supabase
      .from("recharge_orders")
      .update(patch)
      .eq("order_no", orderNo)
      .select("*")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    await supabase.from("support_operation_logs").insert({
      order_no: orderNo,
      action: `support_update:${input.support_status || "note_only"}`,
      created_at: now,
    });

    return mapDbOrder(data as DbRechargeOrder);
  }

  const data = await readStore();
  const order = data.orders.find((item) => item.order_no === orderNo);

  if (!order) {
    return null;
  }

  const now = new Date().toISOString();
  if (input.support_status) {
    order.support_status = input.support_status;
  }
  if ("support_note" in input) {
    order.support_note = input.support_note || null;
  }
  order.updated_at = now;

  data.support_operations.push({
    id: createId("op"),
    order_no: orderNo,
    action: `support_update:${order.support_status}`,
    created_at: now,
  });

  await writeStore(data);
  return order;
}

export const updateSupportStatus = updateSupport;
export const updateSupportNote = updateSupport;
export const updateRechargeOrder = updateSupport;

export async function listPaymentEvents(orderNo: string) {
  const detail = await getOrderDetail(orderNo);
  return detail?.payment_events || [];
}

export const savePaymentEvent = recordPaymentEvent;

export async function getStats() {
  if (shouldUseSupabase()) {
    assertSupabaseConfigured();
    const supabase = getSupabaseAdminClient();
    const today = new Date().toISOString().slice(0, 10);
    const [todayCreated, todayPaid, pendingSupport, disputed, paidOrders] = await Promise.all([
      supabase
        .from("recharge_orders")
        .select("id", { count: "exact", head: true })
        .gte("created_at", `${today}T00:00:00`)
        .lte("created_at", `${today}T23:59:59`),
      supabase
        .from("recharge_orders")
        .select("amount_cents")
        .eq("payment_status", "paid")
        .gte("paid_at", `${today}T00:00:00`)
        .lte("paid_at", `${today}T23:59:59`),
      supabase
        .from("recharge_orders")
        .select("id", { count: "exact", head: true })
        .eq("payment_status", "paid")
        .in("customer_status", ["pending", "processing"]),
      supabase
        .from("recharge_orders")
        .select("id", { count: "exact", head: true })
        .eq("customer_status", "disputed"),
      supabase.from("recharge_orders").select("amount_cents").eq("payment_status", "paid"),
    ]);

    const throwIfError = (...results: Array<{ error: unknown }>) => {
      const failed = results.find((item) => item.error);
      if (failed?.error instanceof Error) {
        throw failed.error;
      }
    };
    throwIfError(todayCreated, todayPaid, pendingSupport, disputed, paidOrders);

    const sum = (rows: Array<{ amount_cents: number }> | null) =>
      (rows || []).reduce((total, item) => total + item.amount_cents, 0);

    return {
      today_created_count: todayCreated.count || 0,
      today_paid_count: todayPaid.data?.length || 0,
      today_paid_amount_cents: sum(todayPaid.data),
      pending_support_count: pendingSupport.count || 0,
      disputed_count: disputed.count || 0,
      total_paid_amount_cents: sum(paidOrders.data),
    };
  }

  const data = await readStore();
  const today = new Date().toISOString().slice(0, 10);
  const todayOrders = data.orders.filter((item) => item.created_at.startsWith(today));
  const todayPaid = data.orders.filter(
    (item) => item.payment_status === "paid" && item.paid_at?.startsWith(today),
  );
  const allPaid = data.orders.filter((item) => item.payment_status === "paid");
  const sum = (orders: RechargeOrder[]) =>
    orders.reduce((total, item) => total + item.amount_cents, 0);

  return {
    today_created_count: todayOrders.length,
    today_paid_count: todayPaid.length,
    today_paid_amount_cents: sum(todayPaid),
    pending_support_count: data.orders.filter(
      (item) =>
        item.payment_status === "paid" &&
        (item.support_status === "unprocessed" || item.support_status === "processing"),
    ).length,
    disputed_count: data.orders.filter((item) => item.support_status === "disputed").length,
    total_paid_amount_cents: sum(allPaid),
  };
}

export function toPublicOrder(order: RechargeOrder) {
  return {
    order_no: order.order_no,
    amount_cents: order.amount_cents,
    currency: order.currency,
    payment_method: order.payment_method,
    payment_provider: order.payment_provider,
    payment_status: order.payment_status,
    phone: order.phone,
    paid_at: order.paid_at,
    created_at: order.created_at,
    support_status: order.support_status,
  };
}
