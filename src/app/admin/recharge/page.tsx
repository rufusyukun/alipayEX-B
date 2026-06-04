"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

type PaymentStatus = "pending" | "paid" | "failed" | "closed";
type SupportStatus = "unprocessed" | "processing" | "completed" | "disputed";

type ProviderRawResponse = {
  code?: string | number;
  msg?: string;
  payData?: string;
  payDataType?: string;
  payOrderId?: string;
  [key: string]: unknown;
};

type Order = {
  order_no: string;
  amount_cents: number;
  currency: string;
  payment_method: string;
  payment_provider: string;
  payment_status: PaymentStatus;
  phone: string | null;
  paid_at: string | null;
  created_at: string;
  support_status: SupportStatus;
  support_note: string | null;
  mock_trade_no: string | null;
  alipay_trade_no: string | null;
  provider_order_id: string | null;
  provider_raw_response: ProviderRawResponse | null;
  notify_sign_verified: boolean | null;
};

type PaymentEvent = {
  id: string;
  event_type: string;
  trade_status: string;
  raw_payload?: unknown;
  sign_verified?: boolean | null;
  received_at: string;
  process_result: string;
};

type SupportOperation = {
  id: string;
  action: string;
  created_at: string;
};

type Detail = {
  order: Order;
  payment_events: PaymentEvent[];
  support_operations: SupportOperation[];
};

type Stats = {
  today_created_count: number;
  today_paid_count: number;
  today_paid_amount_cents: number;
  pending_support_count: number;
  disputed_count: number;
  total_paid_amount_cents: number;
};

const paymentLabels: Record<PaymentStatus, string> = {
  pending: "待支付",
  paid: "已支付",
  failed: "失败",
  closed: "已关闭",
};

const supportLabels: Record<SupportStatus, string> = {
  unprocessed: "未处理",
  processing: "处理中",
  completed: "已完成",
  disputed: "有争议",
};

function formatMoney(cents: number) {
  return `¥${(cents / 100).toLocaleString("zh-CN", { maximumFractionDigits: 2 })}`;
}

function formatTime(value: string | null) {
  return value ? new Date(value).toLocaleString("zh-CN", { hour12: false }) : "-";
}

function statusClass(type: PaymentStatus | SupportStatus) {
  const map: Record<string, string> = {
    paid: "bg-emerald-50 text-emerald-700 border-emerald-100",
    pending: "bg-amber-50 text-amber-700 border-amber-100",
    failed: "bg-red-50 text-red-700 border-red-100",
    closed: "bg-slate-100 text-slate-600 border-slate-200",
    unprocessed: "bg-slate-100 text-slate-700 border-slate-200",
    processing: "bg-blue-50 text-blue-700 border-blue-100",
    completed: "bg-emerald-50 text-emerald-700 border-emerald-100",
    disputed: "bg-red-50 text-red-700 border-red-100",
  };

  return map[type] || map.pending;
}

function signLabel(value: boolean | null) {
  if (value === true) {
    return "验签通过";
  }
  if (value === false) {
    return "验签失败";
  }
  return "无通知";
}

function paymentUrlLabel(payData?: string) {
  if (!payData) {
    return "未返回";
  }

  return /^https?:\/\//i.test(payData) ? "标准 URL" : "非标准 URL";
}

function payDataTypeLabel(payDataType?: string) {
  return payDataType === "payUrl" ? "payUrl" : `${payDataType || "未返回"}（非 payUrl）`;
}

export default function AdminRechargePage() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [orders, setOrders] = useState<Order[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [note, setNote] = useState("");
  const [filters, setFilters] = useState({
    orderNo: "",
    phone: "",
    paymentStatus: "all",
    supportStatus: "all",
    dateFrom: "",
    dateTo: "",
  });
  const [loading, setLoading] = useState(false);
  const [queryMessage, setQueryMessage] = useState("");
  const [syncingRecent, setSyncingRecent] = useState(false);
  const syncingRecentRef = useRef(false);

  async function loadData() {
    setLoading(true);
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value && value !== "all") {
        params.set(key, value);
      }
    });

    const ordersResponse = await fetch(`/api/admin/recharge/orders?${params.toString()}`);

    if (ordersResponse.status === 401) {
      setAuthenticated(false);
      setLoading(false);
      return;
    }

    const ordersData = (await ordersResponse.json()) as { orders: Order[] };
    const statsResponse = await fetch("/api/admin/recharge/stats");

    if (statsResponse.status === 401) {
      setAuthenticated(false);
      setLoading(false);
      return;
    }

    const statsData = (await statsResponse.json()) as Stats;
    setOrders(ordersData.orders);
    setStats(statsData);
    setAuthenticated(true);
    setLoading(false);
  }

  useEffect(() => {
    fetch("/api/admin/auth/me").then((response) => {
      setAuthenticated(response.ok);
      if (response.ok) {
        loadData();
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoginError("");
    const response = await fetch("/api/admin/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });

    if (!response.ok) {
      setLoginError("后台密码错误或未配置 ADMIN_PASSWORD");
      return;
    }

    setPassword("");
    setAuthenticated(true);
    await loadData();
  }

  async function openDetail(orderNo: string) {
    const response = await fetch(`/api/admin/recharge/orders/${orderNo}`);
    if (!response.ok) {
      return;
    }
    const data = (await response.json()) as Detail;
    setDetail(data);
    setNote(data.order.support_note || "");
    setQueryMessage("");
  }

  async function saveSupport(status?: SupportStatus) {
    if (!detail) {
      return;
    }

    const response = await fetch(`/api/admin/recharge/orders/${detail.order.order_no}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        support_status: status || detail.order.support_status,
        support_note: note,
      }),
    });

    if (!response.ok) {
      return;
    }

    await openDetail(detail.order.order_no);
    await loadData();
  }

  async function queryAlipay() {
    if (!detail) {
      return;
    }

    const response = await fetch(`/api/alipay/query?order_no=${detail.order.order_no}`);
    const data = (await response.json()) as { message?: string; error?: string };
    setQueryMessage(data.message || data.error || "查询请求已发送");
    await openDetail(detail.order.order_no);
    await loadData();
  }

  async function syncRecentPendingOrders(source: "manual" | "auto" = "manual") {
    if (syncingRecentRef.current) {
      return;
    }

    syncingRecentRef.current = true;
    setSyncingRecent(true);
    if (source === "manual") {
      setQueryMessage("开始同步最近待支付订单");
    }

    try {
      const response = await fetch("/api/admin/recharge/sync-pending", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source }),
      });
      const data = (await response.json()) as {
        candidateCount?: number;
        syncedCount?: number;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error || "同步最近待支付订单失败");
      }

      if (source === "manual" || (data.syncedCount || 0) > 0) {
        setQueryMessage(
          `同步完成，候选订单 ${data.candidateCount || 0} 笔，更新已支付订单 ${
            data.syncedCount || 0
          } 笔`,
        );
      }
      await loadData();
    } catch (error) {
      if (source === "manual") {
        setQueryMessage(error instanceof Error ? error.message : "同步最近待支付订单失败");
      }
    } finally {
      syncingRecentRef.current = false;
      setSyncingRecent(false);
    }
  }

  useEffect(() => {
    if (!authenticated) {
      return;
    }

    let stopped = false;
    const runAutoSync = () => {
      if (!stopped) {
        void syncRecentPendingOrders("auto");
      }
    };

    runAutoSync();
    const timer = window.setInterval(runAutoSync, 30 * 1000);

    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated]);

  const statCards = useMemo(
    () => [
      ["今日创建订单数", stats?.today_created_count ?? 0],
      ["今日支付成功订单数", stats?.today_paid_count ?? 0],
      ["今日支付成功金额", formatMoney(stats?.today_paid_amount_cents ?? 0)],
      ["待处理订单数", stats?.pending_support_count ?? 0],
      ["有争议订单数", stats?.disputed_count ?? 0],
      ["总支付成功金额", formatMoney(stats?.total_paid_amount_cents ?? 0)],
    ],
    [stats],
  );
  const raw = detail?.order.provider_raw_response || null;

  if (authenticated === null) {
    return <main className="min-h-screen bg-slate-100 p-8">正在检查后台登录状态...</main>;
  }

  if (!authenticated) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
        <form className="w-full max-w-sm rounded-lg bg-white p-6 shadow" onSubmit={login}>
          <h1 className="text-2xl font-bold text-slate-950">alipayEX 后台登录</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            请输入 ADMIN_PASSWORD 访问内部对账系统。
          </p>
          <input
            className="mt-5 h-12 w-full rounded-md border border-slate-300 px-4 outline-none focus:border-blue-600"
            onChange={(event) => setPassword(event.target.value)}
            placeholder="后台密码"
            type="password"
            value={password}
          />
          {loginError ? <p className="mt-3 text-sm font-semibold text-red-600">{loginError}</p> : null}
          <button className="mt-5 h-12 w-full rounded-md bg-blue-600 font-bold text-white" type="submit">
            登录后台
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 p-6 text-slate-950">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">充值订单对账</h1>
            <p className="mt-2 text-sm text-slate-500">
              alipayEX 内部后台，用于按订单号查询、核对和人工处理充值问题。
            </p>
          </div>
          <button
            className="rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-semibold"
            onClick={() => fetch("/api/admin/auth/logout", { method: "POST" }).then(() => setAuthenticated(false))}
            type="button"
          >
            退出
          </button>
        </div>

        <section className="mb-6 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          {statCards.map(([label, value]) => (
            <div className="rounded-lg border border-slate-200 bg-white p-4" key={label}>
              <div className="text-xs text-slate-500">{label}</div>
              <div className="mt-2 text-2xl font-black">{value}</div>
            </div>
          ))}
        </section>

        <section className="mb-4 rounded-lg border border-slate-200 bg-white p-4">
          <div className="grid gap-3 md:grid-cols-6">
            <input className="h-10 rounded-md border border-slate-200 px-3 text-sm" onChange={(event) => setFilters({ ...filters, orderNo: event.target.value })} placeholder="订单号" value={filters.orderNo} />
            <input className="h-10 rounded-md border border-slate-200 px-3 text-sm" onChange={(event) => setFilters({ ...filters, phone: event.target.value })} placeholder="手机号" value={filters.phone} />
            <select className="h-10 rounded-md border border-slate-200 px-3 text-sm" onChange={(event) => setFilters({ ...filters, paymentStatus: event.target.value })} value={filters.paymentStatus}>
              <option value="all">全部支付状态</option>
              <option value="pending">pending</option>
              <option value="paid">paid</option>
              <option value="failed">failed</option>
              <option value="closed">closed</option>
            </select>
            <select className="h-10 rounded-md border border-slate-200 px-3 text-sm" onChange={(event) => setFilters({ ...filters, supportStatus: event.target.value })} value={filters.supportStatus}>
              <option value="all">全部处理状态</option>
              <option value="unprocessed">unprocessed</option>
              <option value="processing">processing</option>
              <option value="completed">completed</option>
              <option value="disputed">disputed</option>
            </select>
            <input className="h-10 rounded-md border border-slate-200 px-3 text-sm" onChange={(event) => setFilters({ ...filters, dateFrom: event.target.value })} type="date" value={filters.dateFrom} />
            <input className="h-10 rounded-md border border-slate-200 px-3 text-sm" onChange={(event) => setFilters({ ...filters, dateTo: event.target.value })} type="date" value={filters.dateTo} />
          </div>
          <button className="mt-3 rounded-md bg-slate-950 px-4 py-2 text-sm font-bold text-white" onClick={loadData} type="button">
            {loading ? "查询中" : "查询订单"}
          </button>
          <button
            className="ml-2 mt-3 rounded-md border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-bold text-blue-700 disabled:opacity-60"
            disabled={syncingRecent}
            onClick={() => syncRecentPendingOrders("manual")}
            type="button"
          >
            {syncingRecent ? "正在同步最近待支付订单" : "批量同步最近待支付订单"}
          </button>
          {queryMessage ? <p className="mt-2 text-sm text-slate-500">{queryMessage}</p> : null}
        </section>

        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1120px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="p-3">订单号</th>
                  <th className="p-3">支付金额</th>
                  <th className="p-3">支付方式</th>
                  <th className="p-3">支付状态</th>
                  <th className="p-3">联系手机号</th>
                  <th className="p-3">客服处理状态</th>
                  <th className="p-3">创建时间</th>
                  <th className="p-3">支付时间</th>
                  <th className="p-3">操作</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr className="border-t border-slate-100" key={order.order_no}>
                    <td className="break-all p-3 font-mono text-xs font-semibold">{order.order_no}</td>
                    <td className="p-3 font-bold">{formatMoney(order.amount_cents)}</td>
                    <td className="p-3">支付宝支付</td>
                    <td className="p-3"><span className={`rounded-full border px-2 py-1 text-xs ${statusClass(order.payment_status)}`}>{paymentLabels[order.payment_status]}</span></td>
                    <td className="p-3">{order.phone || "未填写"}</td>
                    <td className="p-3"><span className={`rounded-full border px-2 py-1 text-xs ${statusClass(order.support_status)}`}>{supportLabels[order.support_status]}</span></td>
                    <td className="p-3">{formatTime(order.created_at)}</td>
                    <td className="p-3">{formatTime(order.paid_at)}</td>
                    <td className="p-3"><button className="font-bold text-blue-600" onClick={() => openDetail(order.order_no)} type="button">查看详情</button></td>
                  </tr>
                ))}
                {orders.length === 0 ? <tr><td className="p-8 text-center text-slate-500" colSpan={9}>暂无订单数据</td></tr> : null}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {detail ? (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-950/40 p-4">
          <section className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-lg bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-bold">订单详情</h2>
              <button className="rounded-md bg-slate-100 px-3 py-1" onClick={() => setDetail(null)} type="button">关闭</button>
            </div>
            <dl className="grid gap-3 text-sm md:grid-cols-2">
              {[
                ["订单号", detail.order.order_no],
                ["支付金额", formatMoney(detail.order.amount_cents)],
                ["支付方式", "支付宝支付"],
                ["支付 provider", detail.order.payment_provider || "unified_order"],
                ["支付状态", paymentLabels[detail.order.payment_status]],
                ["联系手机号", detail.order.phone || "未填写"],
                ["创建时间", formatTime(detail.order.created_at)],
                ["支付时间", formatTime(detail.order.paid_at)],
                ["mock 支付交易号", detail.order.mock_trade_no || "-"],
                ["支付宝交易号", detail.order.alipay_trade_no || "-"],
                ["provider_order_id / payOrderId", detail.order.provider_order_id || "-"],
                ["支付通知验签状态", signLabel(detail.order.notify_sign_verified)],
                ["客服处理状态", supportLabels[detail.order.support_status]],
              ].map(([label, value]) => (
                <div className="rounded-md bg-slate-50 p-3" key={label}>
                  <dt className="text-slate-500">{label}</dt>
                  <dd className="mt-1 break-all font-semibold">{value}</dd>
                </div>
              ))}
            </dl>

            <div className="mt-4">
              <button className="rounded-md bg-slate-950 px-4 py-2 text-sm font-bold text-white" onClick={queryAlipay} type="button">
                主动查询支付宝订单
              </button>
              {queryMessage ? <p className="mt-2 text-sm text-slate-500">{queryMessage}</p> : null}
            </div>

            <div className="mt-4 rounded-md border border-slate-100 bg-slate-50 p-3">
              <h3 className="mb-3 text-sm font-bold">provider raw_response 摘要</h3>
              <dl className="grid gap-2 text-sm md:grid-cols-2">
                <div><dt className="text-slate-500">code</dt><dd className="font-semibold">{String(raw?.code ?? "-")}</dd></div>
                <div><dt className="text-slate-500">msg</dt><dd className="font-semibold">{String(raw?.msg ?? "-")}</dd></div>
                <div><dt className="text-slate-500">payDataType</dt><dd className="font-semibold">{payDataTypeLabel(raw?.payDataType)}</dd></div>
                <div><dt className="text-slate-500">payData URL 状态</dt><dd className="font-semibold">{paymentUrlLabel(raw?.payData)}</dd></div>
                <div className="md:col-span-2">
                  <dt className="text-slate-500">payData 前 120 字符</dt>
                  <dd className="mt-1 break-all font-mono text-xs font-semibold">{raw?.payData?.slice(0, 120) || "-"}</dd>
                </div>
              </dl>
              <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap break-all rounded bg-white p-3 text-xs text-slate-600">
                {JSON.stringify(detail.order.provider_raw_response || null, null, 2)}
              </pre>
            </div>

            <div className="mt-4">
              <label className="text-sm font-bold" htmlFor="support-note">客服备注</label>
              <textarea className="mt-2 min-h-28 w-full rounded-md border border-slate-200 p-3 text-sm" id="support-note" onChange={(event) => setNote(event.target.value)} placeholder="例如：客户已联系、已核对付款截图、金额不一致待复核" value={note} />
              <div className="mt-3 flex flex-wrap gap-2">
                <button className="rounded-md bg-blue-600 px-4 py-2 text-sm font-bold text-white" onClick={() => saveSupport("processing")} type="button">标记为处理中</button>
                <button className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-bold text-white" onClick={() => saveSupport("completed")} type="button">标记为已完成</button>
                <button className="rounded-md bg-red-600 px-4 py-2 text-sm font-bold text-white" onClick={() => saveSupport("disputed")} type="button">标记为有争议</button>
                <button className="rounded-md border border-slate-200 px-4 py-2 text-sm font-bold" onClick={() => saveSupport()} type="button">保存客服备注</button>
              </div>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div>
                <h3 className="mb-2 font-bold">支付事件记录</h3>
                <div className="space-y-2">
                  {detail.payment_events.map((event) => (
                    <div className="rounded-md border border-slate-100 p-3 text-xs" key={event.id}>
                      <div className="font-bold">{event.event_type} / {event.trade_status}</div>
                      <div className="mt-1 text-slate-500">{formatTime(event.received_at)} · {event.process_result} · {signLabel(event.sign_verified ?? null)}</div>
                      <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap break-all rounded bg-slate-50 p-2 text-[11px] text-slate-500">
                        {JSON.stringify(event.raw_payload || null, null, 2)}
                      </pre>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="mb-2 font-bold">操作记录</h3>
                <div className="space-y-2">
                  {detail.support_operations.length ? detail.support_operations.map((operation) => (
                    <div className="rounded-md border border-slate-100 p-3 text-xs" key={operation.id}>
                      <div className="font-bold">{operation.action}</div>
                      <div className="mt-1 text-slate-500">{formatTime(operation.created_at)}</div>
                    </div>
                  )) : <div className="text-sm text-slate-500">暂无操作记录</div>}
                </div>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
