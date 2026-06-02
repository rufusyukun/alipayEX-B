"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";

type QueryState = "checking" | "paid" | "pending" | "error";

function formatMoney(value?: string | null) {
  const numberValue = Number(value || 0);
  return `¥${numberValue.toLocaleString("zh-CN")}`;
}

function SuccessContent() {
  const searchParams = useSearchParams();
  const orderNo = searchParams.get("orderNo") || "";
  const amount = searchParams.get("amount");
  const phone = searchParams.get("phone")?.trim() || "未填写";
  const [queryState, setQueryState] = useState<QueryState>(orderNo ? "checking" : "pending");
  const [message, setMessage] = useState(orderNo ? "正在确认支付结果" : "未获取到订单号");

  useEffect(() => {
    if (!orderNo) {
      return;
    }

    let cancelled = false;

    async function syncPaymentStatus() {
      setQueryState("checking");
      setMessage("正在确认支付结果");

      try {
        const response = await fetch(`/api/alipay/query?order_no=${encodeURIComponent(orderNo)}`);
        const data = (await response.json()) as {
          payment_status?: string;
          synced?: boolean;
          message?: string;
          error?: string;
        };

        if (cancelled) {
          return;
        }

        if (response.ok && (data.payment_status === "paid" || data.synced)) {
          setQueryState("paid");
          setMessage("支付成功");
          return;
        }

        setQueryState("pending");
        setMessage(data.message || data.error || "支付结果确认中，可稍后在后台主动查询");
      } catch (error) {
        console.error("sync payment status from success page failed", error);
        if (!cancelled) {
          setQueryState("error");
          setMessage("支付结果确认中，可稍后在后台主动查询");
        }
      }
    }

    syncPaymentStatus();

    return () => {
      cancelled = true;
    };
  }, [orderNo]);

  const icon = useMemo(() => {
    if (queryState === "paid") {
      return "✓";
    }

    if (queryState === "checking") {
      return "…";
    }

    return "!";
  }, [queryState]);

  return (
    <main className="min-h-screen bg-slate-100 px-3 py-4 text-slate-950">
      <section className="mx-auto min-h-[calc(100vh-32px)] w-full max-w-[430px] rounded-[28px] bg-white px-5 pb-8 pt-[90px] shadow-xl shadow-slate-300/40">
        <div className="mb-6 text-center">
          <div
            className={`mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full text-3xl font-black ${
              queryState === "paid"
                ? "bg-green-50 text-green-500"
                : queryState === "checking"
                  ? "bg-blue-50 text-blue-500"
                  : "bg-amber-50 text-amber-500"
            }`}
          >
            {icon}
          </div>
          <h1 className="text-2xl font-black">
            {queryState === "paid" ? "支付成功" : "正在确认支付结果"}
          </h1>
          <p className="mx-auto mt-3 max-w-[310px] text-sm leading-6 text-slate-500">
            {message === "支付成功"
              ? "请保存订单号，客服可根据订单号人工跟进处理。"
              : "支付结果确认中，可稍后在后台主动查询。"}
          </p>
        </div>

        <section className="mb-6 rounded-[24px] border border-slate-100 bg-slate-50 p-4">
          <div className="mb-4 rounded-2xl bg-white p-4">
            <div className="mb-2 text-sm text-slate-500">订单号</div>
            <div className="break-all font-mono text-base font-black leading-6 text-slate-950">
              {orderNo || "-"}
            </div>
            <button
              className="mt-3 flex min-h-10 w-full items-center justify-center rounded-xl border border-blue-100 bg-blue-50 text-sm font-bold text-blue-700"
              onClick={() => orderNo && navigator.clipboard?.writeText(orderNo)}
              type="button"
            >
              复制订单号
            </button>
          </div>

          <dl className="space-y-3 text-sm">
            <div className="flex items-center justify-between gap-4">
              <dt className="text-slate-500">支付金额</dt>
              <dd className="font-bold text-slate-950">{formatMoney(amount)}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-slate-500">支付方式</dt>
              <dd className="font-medium text-slate-950">支付宝支付</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-slate-500">联系手机号</dt>
              <dd className="break-all text-right font-medium text-slate-950">{phone}</dd>
            </div>
          </dl>
        </section>

        <div className="pb-4">
          <Link
            className="flex min-h-[52px] w-full items-center justify-center rounded-2xl bg-blue-600 text-base font-bold text-white transition hover:bg-blue-700"
            href="/recharge"
          >
            返回充值页
          </Link>
        </div>
      </section>
    </main>
  );
}

export default function SuccessPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-slate-100 px-3 py-4 text-slate-950">
          <section className="mx-auto min-h-[calc(100vh-32px)] w-full max-w-[430px] rounded-[28px] bg-white px-5 pb-8 pt-[90px] text-center shadow-xl shadow-slate-300/40">
            <h1 className="text-2xl font-black">正在确认支付结果</h1>
            <p className="mt-3 text-sm text-slate-500">请稍候...</p>
          </section>
        </main>
      }
    >
      <SuccessContent />
    </Suspense>
  );
}
