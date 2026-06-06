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
  const [androidIntentUrl, setAndroidIntentUrl] = useState("");
  const [fallbackUrl, setFallbackUrl] = useState("");
  const [showFallback, setShowFallback] = useState(false);
  const [syncState, setSyncState] = useState<"idle" | "polling" | "paid" | "timeout" | "error">(
    "idle",
  );
  const [syncMessage, setSyncMessage] = useState("");
  const [orderExpired, setOrderExpired] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
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

  function isAndroidDevice() {
    return typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent);
  }

  function getPreferredLaunchUrl(nextAlipayScheme = alipayScheme, nextAndroidIntentUrl = androidIntentUrl) {
    return isAndroidDevice() && nextAndroidIntentUrl ? nextAndroidIntentUrl : nextAlipayScheme;
  }

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

  useEffect(() => {
    let stopped = false;

    const checkExpired = async () => {
      try {
        const response = await fetch(`/api/recharge/status?order_no=${encodeURIComponent(orderNo)}`);
        const data = (await response.json()) as {
          payment_status?: string;
          isExpired?: boolean;
          remainingSeconds?: number;
        };

        if (stopped || !response.ok) {
          return;
        }

        if (data.payment_status === "paid") {
          paidRef.current = true;
          setOrderExpired(false);
          setRemainingSeconds(data.remainingSeconds ?? null);
          stopPolling();
          setSyncState("paid");
          setSyncMessage("支付成功");
          return;
        }

        setRemainingSeconds(data.remainingSeconds ?? null);

        if (data.isExpired) {
          setOrderExpired(true);
          setAlipayScheme("");
          setAlipaySchemeAlt("");
          setAndroidIntentUrl("");
          setFallbackUrl("");
          setShowFallback(false);
          setAlipayState("idle");
          stopPolling();
          setSyncState("timeout");
          setSyncMessage("订单已超时，请重新下单。");
        } else {
          setOrderExpired(false);
        }
      } catch {
        // Keep the existing payment UI usable if the status check is temporarily unavailable.
      }
    };

    void checkExpired();
    const timer = window.setInterval(checkExpired, 1000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [orderNo, stopPolling]);

  function openPayment(schemeOrUrl: string, fallback?: string, showActions = true) {
    setAlipayState("jumping");
    setNotice("正在打开支付宝...");
    setShowFallback(showActions);
    startPolling();
    window.location.href = schemeOrUrl;

    if (fallback && !showActions) {
      window.setTimeout(() => {
        setShowFallback(true);
        setAlipayState("idle");
      }, 1500);
      return;
    }

    window.setTimeout(() => {
      setAlipayState("idle");
    }, 1500);
  }

  function markManualLaunch() {
    setAlipayState("jumping");
    setNotice("正在同步支付结果...");
    setShowFallback(true);
    startPolling();
    window.setTimeout(() => {
      setAlipayState("idle");
    }, 1500);
  }

  async function startAlipay() {
    if (orderExpired) {
      setError("订单已超时，请重新下单。");
      return;
    }

    if (paying || loadingMock) {
      return;
    }

    if (alipayScheme) {
      openPayment(getPreferredLaunchUrl(), fallbackUrl);
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
        android_intent_url?: string | null;
        fallback_url?: string | null;
        app_id?: string | null;
        path?: string | null;
        qr_url?: string | null;
        jeepay_token?: string | null;
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
        setAndroidIntentUrl(data.android_intent_url || "");
        setFallbackUrl(data.fallback_url || "");
        setNotice("支付订单已创建，请点击打开支付宝");
        setShowFallback(true);
        openPayment(
          getPreferredLaunchUrl(data.alipay_scheme, data.android_intent_url || ""),
          data.fallback_url || "",
        );
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
    <main className="min-h-screen bg-slate-100 px-3 py-4 pb-[132px] text-white">
      <section className="mx-auto flex min-h-[calc(100vh-32px)] w-full max-w-[430px] flex-col overflow-hidden rounded-[28px] bg-[#181818] shadow-xl shadow-black/60">
        <div className="flex-1 overflow-y-auto px-5 pb-[132px] pt-5">
          <div className="mb-5 flex items-center justify-between">
            <Link
              className="flex h-9 w-9 items-center justify-center rounded-full bg-[#242424] text-lg text-[#FF9900]"
              href="/recharge"
            >
              ←
            </Link>
            <h1 className="font-bold">确认订单</h1>
            <span className="h-9 w-9" />
          </div>

          <div className="py-5 text-center">
            <div className="text-sm text-[#A3A3A3]">支付金额</div>
            <div className="mt-1 text-5xl font-black">{formatMoney(amount)}</div>
            <div className="mt-2 text-sm text-[#FF9900]">支付宝支付</div>
          </div>

          <dl className="mb-4 space-y-3 rounded-[24px] border border-[#2A2A2A] bg-[#1F1F1F] p-4 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-[#A3A3A3]">订单号</dt>
              <dd className="break-all text-right font-medium">{orderNo}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[#A3A3A3]">支付金额</dt>
              <dd className="font-medium">{formatMoney(amount)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[#A3A3A3]">支付方式</dt>
              <dd className="font-medium">支付宝支付</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[#A3A3A3]">联系手机号</dt>
              <dd className="font-medium">{phone}</dd>
            </div>
          </dl>

          <p className="mb-4 rounded-[24px] border border-[#2A2A2A] bg-[#1F1F1F] p-4 text-sm leading-6 text-[#A3A3A3]">
            真实支付结果以后端异步通知或查单同步为准。付款后请保存订单号，客服可根据订单号人工跟进。
          </p>

          {error ? (
            <p className="rounded-2xl border border-red-500/30 bg-red-950/40 px-4 py-3 text-sm font-semibold text-red-400">
              {error}
            </p>
          ) : null}

          {notice ? (
            <p className="rounded-2xl border border-[#FF9900]/30 bg-[#3A2600] px-4 py-3 text-sm font-semibold text-[#FF9900]">
              {notice}
            </p>
          ) : null}

          {syncMessage ? (
            <p
              className={`mt-3 rounded-2xl px-4 py-3 text-sm font-semibold ${
                syncState === "paid"
                  ? "border border-emerald-500/30 bg-emerald-950/40 text-emerald-400"
                  : syncState === "timeout" || syncState === "error"
                    ? "border border-[#FF9900]/30 bg-[#3A2600] text-[#FF9900]"
                    : "border border-[#FF9900]/30 bg-[#1F1F1F] text-[#F6A400]"
              }`}
            >
              {syncMessage}
            </p>
          ) : null}

          {!orderExpired && syncState !== "paid" && remainingSeconds !== null ? (
            <p className="mt-3 rounded-2xl border border-[#2A2A2A] bg-[#1F1F1F] px-4 py-3 text-sm font-semibold text-[#A3A3A3]">
              支付剩余时间：{remainingSeconds} 秒
            </p>
          ) : null}

          {showFallback && (alipayScheme || androidIntentUrl || fallbackUrl) ? (
            <div className="rounded-2xl border border-[#2A2A2A] bg-[#1F1F1F] px-4 py-3 text-sm text-[#A3A3A3]">
              <p className="font-semibold text-white">支付订单已创建，请点击打开支付宝</p>
              <p className="mt-1 leading-6">
                如果没有自动打开支付宝，请点击下方按钮继续支付。小米或部分 Android 浏览器可能会拦截自动唤起。
              </p>
              <div className="mt-3 grid gap-2">
                {alipayScheme ? (
                  <a
                    className="rounded-xl bg-[#FF9900] px-4 py-3 text-center font-black text-black"
                    href={alipayScheme}
                    onClick={markManualLaunch}
                  >
                    打开支付宝支付
                  </a>
                ) : null}
                {androidIntentUrl ? (
                  <a
                    className="rounded-xl border border-[#FF9900]/40 bg-[#3A2600] px-4 py-3 text-center font-bold text-[#FF9900]"
                    href={androidIntentUrl}
                    onClick={markManualLaunch}
                  >
                    安卓备用打开方式
                  </a>
                ) : null}
                {alipaySchemeAlt ? (
                  <button
                    className="rounded-xl bg-[#FF9900] px-4 py-3 font-black text-black"
                    onClick={() => openPayment(alipaySchemeAlt, fallbackUrl)}
                    type="button"
                  >
                    备用方式一：重新打开支付宝
                  </button>
                ) : null}
                <a
                  className="rounded-xl border border-[#2A2A2A] bg-[#242424] px-4 py-3 font-bold text-[#FF9900] underline"
                  href={fallbackUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  备用方式二：打开 H5 调试链接
                </a>
              </div>
              <p className="mt-3 leading-6">
                如果仍无法打开，请换用系统浏览器或 Chrome，并确认手机已安装支付宝且允许浏览器打开外部应用。
              </p>
            </div>
          ) : null}

          {paymentContent ? (
            <div className="rounded-2xl border border-[#2A2A2A] bg-[#1F1F1F] px-4 py-3 text-sm text-[#A3A3A3]">
              <p className="font-semibold text-white">支付订单已创建</p>
              <p className="mt-1 leading-6">
                网关返回了支付内容但不是标准跳转 URL。请复制以下内容到浏览器或支付宝中打开。
              </p>
              <a
                className="mt-3 block break-all rounded-xl border border-[#2A2A2A] bg-[#242424] p-3 font-mono text-xs font-semibold text-[#FF9900]"
                href={paymentContent}
                rel="noreferrer"
                target="_blank"
              >
                {paymentContent}
              </a>
            </div>
          ) : null}
        </div>

        <div className="fixed inset-x-0 bottom-0 z-50 border-t border-[#2A2A2A] bg-white/95 px-5 pb-[calc(16px+env(safe-area-inset-bottom))] pt-3 shadow-[0_-10px_30px_rgba(0,0,0,0.18)] backdrop-blur">
          <div className="mx-auto w-full max-w-[430px] space-y-3">
            <button
              className={`flex min-h-[58px] w-full items-center justify-center rounded-[22px] text-[17px] font-semibold transition ${
                orderExpired
                  ? "border border-[#2A2A2A] bg-[#1F1F1F] text-[#FF9900]"
                  : "bg-[#FF9900] text-black hover:bg-[#F6A400] disabled:bg-[#2A2A2A] disabled:text-[#6B6B6B]"
              }`}
              disabled={orderExpired || checkingOrderStatus || paying || loadingMock || syncState === "paid"}
              onClick={orderExpired ? () => router.push("/recharge") : startAlipay}
              type="button"
            >
              {orderExpired
                ? "返回重新下单"
                : checkingOrderStatus
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
                className="flex min-h-[48px] w-full items-center justify-center rounded-2xl border border-[#2A2A2A] bg-[#1F1F1F] text-sm font-bold text-[#A3A3A3] transition hover:bg-[#242424] disabled:bg-[#111111]"
                disabled={loadingMock || paying}
                onClick={confirmMockPay}
                type="button"
              >
                {loadingMock ? "正在处理 mock 支付" : "开发环境 mock 支付"}
              </button>
            ) : null}
          </div>
        </div>
      </section>
    </main>
  );
}
