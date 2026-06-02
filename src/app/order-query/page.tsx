"use client";

import { FormEvent, useState } from "react";

type PublicOrder = {
  order_no: string;
  amount_cents: number;
  payment_method: string;
  payment_status: string;
  phone: string | null;
  paid_at: string | null;
  created_at: string;
  support_status: string;
};

function formatMoney(cents: number) {
  return `¥${(cents / 100).toLocaleString("zh-CN", { maximumFractionDigits: 2 })}`;
}

function formatTime(value: string | null) {
  return value ? new Date(value).toLocaleString("zh-CN", { hour12: false }) : "-";
}

export default function OrderQueryPage() {
  const [orderNo, setOrderNo] = useState("");
  const [order, setOrder] = useState<PublicOrder | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function queryOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) {
      return;
    }
    setError("");
    setOrder(null);

    if (!orderNo.trim()) {
      setError("请输入订单号");
      return;
    }

    setLoading(true);
    let response: Response;
    let data: { order?: PublicOrder; error?: string };

    try {
      response = await fetch(`/api/order-query?orderNo=${encodeURIComponent(orderNo.trim())}`);
      data = (await response.json()) as { order?: PublicOrder; error?: string };
    } catch (err) {
      console.error("query order failed", err);
      setError("订单加载失败，请返回重试");
      setLoading(false);
      return;
    }

    setLoading(false);

    if (!response.ok || !data.order) {
      setError(data.error || "未查询到订单");
      return;
    }

    setOrder(data.order);
  }

  return (
    <main className="min-h-screen bg-slate-100 px-3 py-4 text-slate-950">
      <section className="mx-auto min-h-[calc(100vh-32px)] w-full max-w-[430px] rounded-[28px] bg-white p-5 shadow-xl shadow-slate-300/40">
        <h1 className="text-2xl font-black">订单查询</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          输入支付成功页保存的订单号，查询当前支付和客服处理状态。
        </p>

        <form className="mt-6" onSubmit={queryOrder}>
          <input
            className="h-12 w-full rounded-2xl border border-slate-200 px-4 font-mono text-sm outline-none focus:border-blue-500"
            onChange={(event) => setOrderNo(event.target.value)}
            placeholder="请输入订单号"
            value={orderNo}
          />
          <button className="mt-3 flex min-h-[52px] w-full items-center justify-center rounded-2xl bg-blue-600 font-bold text-white disabled:bg-slate-300" disabled={loading} type="submit">
            {loading ? "查询中" : "查询订单"}
          </button>
        </form>

        {error ? <p className="mt-4 rounded-2xl bg-red-50 p-3 text-sm font-semibold text-red-600">{error}</p> : null}

        {order ? (
          <section className="mt-5 rounded-[24px] border border-slate-100 bg-slate-50 p-4">
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-slate-500">订单号</dt>
                <dd className="mt-1 break-all font-mono text-base font-black">{order.order_no}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">支付金额</dt>
                <dd className="font-bold">{formatMoney(order.amount_cents)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">支付状态</dt>
                <dd className="font-bold">{order.payment_status}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">客服处理状态</dt>
                <dd className="font-bold">{order.support_status}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">创建时间</dt>
                <dd className="text-right">{formatTime(order.created_at)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">支付时间</dt>
                <dd className="text-right">{formatTime(order.paid_at)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">联系手机号</dt>
                <dd>{order.phone || "未填写"}</dd>
              </div>
            </dl>
            <p className="mt-4 rounded-2xl bg-blue-50 p-3 text-sm leading-6 text-slate-600">
              如需人工处理，请将订单号发送给客服。
            </p>
          </section>
        ) : null}
      </section>
    </main>
  );
}
