"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

const isDevelopment = process.env.NODE_ENV === "development";

function formatMoney(value: string | null) {
  const numberValue = Number(value || 0);
  return `¥${numberValue.toLocaleString("zh-CN")}`;
}

function isExistingOrderMessage(message: string) {
  return message.includes("已存在") || message.toLowerCase().includes("already exists");
}

export default function PayPage() {
  const params = useParams<{ orderNo: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [alipayState, setAlipayState] = useState<"idle" | "creating" | "jumping">("idle");
  const [loadingMock, setLoadingMock] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [paymentContent, setPaymentContent] = useState("");
  const [paymentUrl, setPaymentUrl] = useState("");
  const orderNo = params.orderNo;
  const amount = searchParams.get("amount");
  const phoneParam = searchParams.get("phone");
  const phone = phoneParam || "未填写";
  const paying = alipayState !== "idle";

  function buildSuccessUrl() {
    const successParams = new URLSearchParams({ orderNo });
    if (amount) {
      successParams.set("amount", amount);
    }
    if (phoneParam) {
      successParams.set("phone", phoneParam);
    }
    return `/success?${successParams.toString()}`;
  }

  async function startAlipay() {
    if (paying || loadingMock) {
      return;
    }

    if (paymentUrl) {
      setAlipayState("jumping");
      window.location.href = paymentUrl;
      return;
    }

    setAlipayState("creating");
    setError("");
    setNotice("");
    setPaymentContent("");

    try {
      const response = await fetch("/api/alipay/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ order_no: orderNo }),
      });
      const data = (await response.json()) as {
        payment_url?: string | null;
        payment_content?: string | null;
        payment_content_type?: "url" | "qr" | "content" | null;
        error?: string;
      };

      if (!response.ok) {
        const message = data.error || "支付接口未配置，请联系管理员";
        if (isExistingOrderMessage(message)) {
          setNotice("该订单已创建支付请求，请刷新页面或重新下单。");
          setAlipayState("idle");
          return;
        }

        throw new Error(message);
      }

      if (data.payment_url) {
        setPaymentUrl(data.payment_url);
        setAlipayState("jumping");
        window.location.href = data.payment_url;
        return;
      }

      if (data.payment_content) {
        setPaymentContent(data.payment_content);
        setAlipayState("idle");
        return;
      }

      throw new Error(data.error || "支付订单创建成功，但未返回支付跳转地址");
    } catch (err) {
      setError(err instanceof Error ? err.message : "支付接口未配置，请联系管理员");
      setAlipayState("idle");
    }
  }

  async function confirmMockPay() {
    if (loadingMock || paying) {
      return;
    }

    setLoadingMock(true);
    setError("");

    try {
      const response = await fetch("/api/recharge/mock-pay", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ order_no: orderNo }),
      });
      const data = (await response.json()) as { paid?: boolean; error?: string };

      if (!response.ok || !data.paid) {
        throw new Error(data.error || "模拟支付失败");
      }

      router.push(buildSuccessUrl());
    } catch (err) {
      setError(err instanceof Error ? err.message : "模拟支付失败");
    } finally {
      setLoadingMock(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-100 px-3 py-4 text-slate-950">
      <section className="mx-auto flex min-h-[calc(100vh-32px)] w-full max-w-[430px] flex-col overflow-hidden rounded-[28px] bg-white shadow-xl shadow-slate-300/40">
        <div className="flex-1 overflow-y-auto px-5 py-5">
          <div className="mb-5 flex items-center justify-between">
            <Link
              className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-lg"
              href="/recharge"
            >
              ←
            </Link>
            <h1 className="font-bold">确认订单</h1>
            <span className="h-9 w-9" />
          </div>

          <div className="py-5 text-center">
            <div className="text-sm text-slate-400">支付金额</div>
            <div className="mt-1 text-5xl font-black">{formatMoney(amount)}</div>
            <div className="mt-2 text-sm text-blue-600">支付宝支付</div>
          </div>

          <dl className="mb-4 space-y-3 rounded-[24px] border border-slate-100 bg-slate-50 p-4 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">订单号</dt>
              <dd className="break-all text-right font-medium">{orderNo}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">支付金额</dt>
              <dd className="font-medium">{formatMoney(amount)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">支付方式</dt>
              <dd className="font-medium">支付宝支付</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">联系手机号</dt>
              <dd className="font-medium">{phone}</dd>
            </div>
          </dl>

          <p className="mb-4 rounded-[24px] border border-blue-100 bg-blue-50 p-4 text-sm leading-6 text-slate-600">
            真实支付结果以后端异步通知或查单同步为准。付款后请保存订单号，客服可根据订单号人工跟进。
          </p>

          {error ? (
            <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">
              {error}
            </p>
          ) : null}

          {notice ? (
            <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700">
              {notice}
            </p>
          ) : null}

          {paymentContent ? (
            <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-slate-700">
              <p className="font-semibold text-slate-950">支付订单已创建</p>
              <p className="mt-1 leading-6">
                网关返回了支付内容但不是标准跳转 URL。请复制以下内容到浏览器或支付宝中打开。
              </p>
              <a
                className="mt-3 block break-all rounded-xl bg-white p-3 font-mono text-xs font-semibold text-blue-700"
                href={paymentContent}
                rel="noreferrer"
                target="_blank"
              >
                {paymentContent}
              </a>
            </div>
          ) : null}
        </div>

        <div className="space-y-3 border-t border-slate-100 bg-white/95 p-4 backdrop-blur">
          <button
            className="flex min-h-[52px] w-full items-center justify-center rounded-2xl bg-blue-600 text-base font-bold text-white transition hover:bg-blue-700 disabled:bg-slate-300"
            disabled={paying || loadingMock}
            onClick={startAlipay}
            type="button"
          >
            {alipayState === "creating"
              ? "正在创建支付链接..."
              : alipayState === "jumping"
                ? "正在跳转支付宝..."
                : "跳转支付宝支付"}
          </button>
          {isDevelopment ? (
            <button
              className="flex min-h-[48px] w-full items-center justify-center rounded-2xl border border-slate-200 bg-white text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:bg-slate-100"
              disabled={loadingMock || paying}
              onClick={confirmMockPay}
              type="button"
            >
              {loadingMock ? "正在处理 mock 支付" : "开发环境 mock 支付"}
            </button>
          ) : null}
        </div>
      </section>
    </main>
  );
}
