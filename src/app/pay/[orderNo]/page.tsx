"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

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
  const [alipayScheme, setAlipayScheme] = useState("");
  const [alipaySchemeAlt, setAlipaySchemeAlt] = useState("");
  const [fallbackUrl, setFallbackUrl] = useState("");
  const [showFallback, setShowFallback] = useState(false);
  const [syncState, setSyncState] = useState<"idle" | "polling" | "paid" | "timeout" | "error">(
    "idle",
  );
  const [syncMessage, setSyncMessage] = useState("");
  const [initialStatusChecked, setInitialStatusChecked] = useState(false);
  const pollingActiveRef = useRef(false);
  const pollingTimerRef = useRef<number | null>(null);
  const pollingStartedAtRef = useRef(0);
  const queryInFlightRef = useRef(false);
  const paidRef = useRef(false);
  const orderNo = params.orderNo;
  const amount = searchParams.get("amount");
  const phoneParam = searchParams.get("phone");
  const phone = phoneParam || "未填写";
  const paying = alipayState !== "idle";
  const checkingOrderStatus = !initialStatusChecked && syncState !== "paid";

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

  const stopPolling = useCallback(() => {
    pollingActiveRef.current = false;
    if (pollingTimerRef.current !== null) {
      window.clearTimeout(pollingTimerRef.current);
      pollingTimerRef.current = null;
    }
  }, []);

  const queryPaymentStatus = useCallback(async () => {
    if (queryInFlightRef.current) {
      return;
    }

    queryInFlightRef.current = true;

    try {
      const response = await fetch(`/api/alipay/query?orderNo=${encodeURIComponent(orderNo)}`);
      const data = (await response.json()) as {
        payment_status?: string;
        paymentStatus?: string;
        status?: string;
        synced?: boolean;
        error?: string;
      };
      const paymentStatus = data.payment_status || data.paymentStatus || data.status || "";

      if (response.ok && (paymentStatus.toLowerCase() === "paid" || data.synced)) {
        paidRef.current = true;
        stopPolling();
        setError("");
        setNotice("");
        setSyncState("paid");
        setSyncMessage("支付成功");
        setAlipayState("idle");
        return;
      }

      if (!response.ok && data.error) {
        setSyncState("error");
        setSyncMessage(data.error);
      }
    } catch {
      setSyncState("error");
      setSyncMessage("支付状态查询失败，稍后会继续重试。");
    } finally {
      setInitialStatusChecked(true);
      queryInFlightRef.current = false;
    }
  }, [orderNo, stopPolling]);

  const startPolling = useCallback(() => {
    if (pollingActiveRef.current || paidRef.current) {
      return;
    }

    pollingActiveRef.current = true;
    pollingStartedAtRef.current = Date.now();
    setSyncState("polling");
    setSyncMessage("正在同步支付结果...");

    const tick = async () => {
      if (!pollingActiveRef.current) {
        return;
      }

      if (Date.now() - pollingStartedAtRef.current >= 2 * 60 * 1000) {
        stopPolling();
        setSyncState("timeout");
        setSyncMessage("暂未查询到支付结果，请稍后刷新或联系客服。");
        return;
      }

      await queryPaymentStatus();

      if (pollingActiveRef.current) {
        pollingTimerRef.current = window.setTimeout(tick, 3000);
      }
    };

    void tick();
  }, [queryPaymentStatus, stopPolling]);

  useEffect(() => {
    startPolling();
    return stopPolling;
  }, [startPolling, stopPolling]);

  function openPayment(schemeOrUrl: string, fallback?: string) {
    setAlipayState("jumping");
    setNotice("正在打开支付宝...");
    setShowFallback(false);
    startPolling();
    window.location.href = schemeOrUrl;

    if (fallback) {
      window.setTimeout(() => {
        setShowFallback(true);
        setAlipayState("idle");
      }, 1500);
    }
  }

  async function startAlipay() {
    if (paying || loadingMock) {
      return;
    }

    if (alipayScheme) {
      openPayment(alipayScheme, fallbackUrl);
      return;
    }

    if (fallbackUrl) {
      openPayment(fallbackUrl);
      return;
    }

    setAlipayState("creating");
    setError("");
    setNotice("");
    setPaymentContent("");
    setShowFallback(false);

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
        alipay_scheme?: string | null;
        alipay_scheme_alt?: string | null;
        fallback_url?: string | null;
        payment_content?: string | null;
        payment_content_type?: "url" | "qr" | "content" | null;
        error?: string;
      };

      if (!response.ok) {
        const message = data.error || "支付接口未配置，请联系管理员";
        if (isExistingOrderMessage(message)) {
          setNotice("该订单已创建支付请求，请刷新页面或重新下单。");
          setAlipayState("idle");
          startPolling();
          return;
        }

        throw new Error(message);
      }

      if (data.alipay_scheme) {
        setAlipayScheme(data.alipay_scheme);
        setAlipaySchemeAlt(data.alipay_scheme_alt || "");
        setFallbackUrl(data.fallback_url || "");
        openPayment(data.alipay_scheme, data.fallback_url || "");
        return;
      }

      if (data.payment_url) {
        setFallbackUrl(data.payment_url);
        openPayment(data.payment_url);
        return;
      }

      if (data.payment_content) {
        setPaymentContent(data.payment_content);
        setAlipayState("idle");
        startPolling();
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

          {syncMessage ? (
            <p
              className={`mt-3 rounded-2xl px-4 py-3 text-sm font-semibold ${
                syncState === "paid"
                  ? "bg-emerald-50 text-emerald-700"
                  : syncState === "timeout" || syncState === "error"
                    ? "bg-amber-50 text-amber-700"
                    : "bg-blue-50 text-blue-700"
              }`}
            >
              {syncMessage}
            </p>
          ) : null}

          {showFallback && fallbackUrl ? (
            <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-slate-700">
              <p className="font-semibold text-slate-950">正在打开支付宝...</p>
              <p className="mt-1 leading-6">
                备用链接仅用于调试，官方说明 qrUrl 不能直接作为普通链接支付。
              </p>
              <div className="mt-3 grid gap-2">
                {alipaySchemeAlt ? (
                  <button
                    className="rounded-xl bg-blue-600 px-4 py-3 font-bold text-white"
                    onClick={() => openPayment(alipaySchemeAlt, fallbackUrl)}
                    type="button"
                  >
                    备用方式一：重新打开支付宝
                  </button>
                ) : null}
                <a
                  className="rounded-xl bg-white px-4 py-3 font-bold text-blue-700 underline"
                  href={fallbackUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  备用方式二：打开 H5 调试链接
                </a>
              </div>
            </div>
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
            disabled={checkingOrderStatus || paying || loadingMock || syncState === "paid"}
            onClick={startAlipay}
            type="button"
          >
            {checkingOrderStatus
              ? "正在确认订单状态..."
              : syncState === "paid"
              ? "支付成功"
              : alipayState === "creating"
              ? "正在创建支付链接..."
              : alipayState === "jumping"
                ? "正在打开支付宝..."
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
