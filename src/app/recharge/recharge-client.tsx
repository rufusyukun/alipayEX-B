"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

const packages = [
  { id: 1, amount: 1, tag: "测试" },
  { id: 2, amount: 2, tag: "测试" },
  { id: 4, amount: 298, tag: "小额" },
  { id: 5, amount: 596, tag: "推荐" },
  { id: 6, amount: 1192, tag: "热门" },
  { id: 7, amount: 1788, tag: "高配" },
];

const examples = ["照片转 3D 模型", "手办/摆件打印", "建筑沙盘零件", "高精度树脂打印"];

type CreateOrderResponse = {
  ok?: boolean;
  orderNo?: string;
  amount?: number;
  message?: string;
};

function formatMoney(value: number) {
  return `¥${value.toLocaleString("zh-CN")}`;
}

export function RechargeClient() {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState(4);
  const [phone, setPhone] = useState("");
  const [agree, setAgree] = useState(true);
  const [submitState, setSubmitState] = useState<"idle" | "creating" | "jumping">("idle");
  const [error, setError] = useState("");

  const selectedPackage = useMemo(
    () => packages.find((item) => item.id === selectedId) ?? packages[3],
    [selectedId],
  );
  const payable = selectedPackage.amount;
  const loading = submitState !== "idle";
  const canSubmit = agree && !loading;
  const submitText =
    submitState === "creating"
      ? "正在创建订单..."
      : submitState === "jumping"
        ? "正在跳转支付..."
        : "立即支付";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (loading) {
      return;
    }

    setError("");

    if (!agree) {
      setError("请先确认充值说明");
      return;
    }

    setSubmitState("creating");

    try {
      const response = await fetch("/api/recharge/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ amount: payable, phone: phone || "" }),
      });
      const data = (await response.json().catch(() => null)) as CreateOrderResponse | null;

      if (!response.ok || !data?.ok || !data.orderNo) {
        throw new Error(data?.message || "创建订单失败，请稍后重试");
      }

      setSubmitState("jumping");
      const params = new URLSearchParams({ amount: String(data.amount ?? payable) });
      if (phone) {
        params.set("phone", phone);
      }

      router.push(`/pay/${encodeURIComponent(data.orderNo)}?${params.toString()}`);
    } catch (err) {
      console.error("create recharge order failed", err);
      setError("创建订单失败，请稍后重试");
      setSubmitState("idle");
    }
  }

  return (
    <main className="min-h-[100dvh] overflow-hidden bg-[#0B0B0B] px-3 text-white">
      <form
        className="mx-auto flex min-h-[100dvh] w-full max-w-[430px] flex-col overflow-hidden bg-[#181818] shadow-xl shadow-black/60 sm:rounded-[28px]"
        onSubmit={handleSubmit}
      >
        <div className="flex-1 overflow-y-auto px-4 pb-[150px] pt-4">
          <section className="mb-4">
            <div className="mb-3 flex items-start justify-between gap-4">
              <div>
                <h1 className="text-xl font-black tracking-tight">账户充值</h1>
                <p className="mt-1 text-xs text-[#A3A3A3]">选择金额后使用支付宝完成支付</p>
              </div>
              <span className="shrink-0 text-xs font-medium text-[#A3A3A3]">人民币 CNY</span>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              {packages.map((item) => {
                const selected = selectedId === item.id;

                return (
                  <button
                    className={`relative min-h-[96px] rounded-[20px] border p-3.5 text-left transition ${
                      selected
                        ? "border-[#FF9900] bg-[#242424] shadow-lg shadow-[#FF9900]/20"
                        : "border-[#2A2A2A] bg-[#1F1F1F] shadow-sm shadow-black/30 hover:border-[#F6A400]/60"
                    }`}
                    key={item.id}
                    onClick={() => setSelectedId(item.id)}
                    type="button"
                  >
                    <span
                      className={`absolute right-3 top-3 rounded-full px-2 py-0.5 text-[10px] ${
                        selected ? "bg-[#FF9900] text-black" : "bg-slate-100 text-[#A3A3A3]"
                      }`}
                    >
                      {item.tag}
                    </span>
                    <div className="text-2xl font-black">¥{item.amount}</div>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="mb-4 rounded-[22px] border border-[#2A2A2A] bg-[#1F1F1F] p-3.5">
            <div className="mb-2.5 flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#FF9900] text-sm font-black text-black">
                ¥
              </span>
              <h2 className="text-base font-bold">支付方式</h2>
            </div>
            <div className="flex items-center justify-between rounded-2xl border border-[#2A2A2A] bg-[#242424] p-2.5">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-[#FF9900] font-black text-black">
                  支
                </div>
                <div>
                  <div className="font-bold">支付宝支付</div>
                  <div className="text-xs text-[#A3A3A3]">跳转支付宝完成付款</div>
                </div>
              </div>
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#FF9900] text-xs text-black">
                ✓
              </span>
            </div>
          </section>

          <section className="mb-4">
            <label className="mb-2 block text-sm font-bold" htmlFor="phone">
              接收凭证手机号 <span className="font-normal text-[#A3A3A3]">可选</span>
            </label>
            <input
              className="w-full rounded-2xl border border-[#2A2A2A] bg-[#1F1F1F] px-4 py-2.5 text-white outline-none transition placeholder:text-[#6B6B6B] focus:border-[#FF9900] focus:ring-4 focus:ring-[#FF9900]/15"
              id="phone"
              inputMode="numeric"
              maxLength={11}
              onChange={(event) =>
                setPhone(event.target.value.replace(/[^0-9]/g, "").slice(0, 11))
              }
              placeholder="用于查询订单，不填也可付款"
              type="tel"
              value={phone}
            />
          </section>

          <section className="mb-4 grid grid-cols-2 gap-2">
            {examples.map((item) => (
              <div
                className="flex items-center gap-1.5 rounded-2xl border border-[#2A2A2A] bg-[#1F1F1F] px-3 py-1.5 text-xs text-[#A3A3A3]"
                key={item}
              >
                <span className="text-[#FF9900]">✓</span>
                {item}
              </div>
            ))}
          </section>

          <label className="flex items-start gap-2 text-xs leading-relaxed text-[#A3A3A3]">
            <input
              checked={agree}
              className="mt-0.5"
              onChange={(event) => setAgree(event.target.checked)}
              type="checkbox"
            />
            <span>
              我已确认充值金额，付款后请保存订单号；如需人工处理，可联系客服根据订单号跟进。
            </span>
          </label>

          {error ? (
            <p className="mt-4 rounded-2xl border border-red-500/30 bg-red-950/40 px-4 py-3 text-sm font-semibold text-red-400">
              {error}
            </p>
          ) : null}
        </div>

        <footer className="fixed inset-x-0 bottom-0 z-50 border-t border-[#2A2A2A] bg-[#111111]/95 px-3 pt-3 pb-[max(14px,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur">
          <div className="mx-auto mb-3 flex w-full max-w-[430px] items-center justify-between text-sm">
            <span className="text-[#A3A3A3]">应付金额</span>
            <span className="text-2xl font-black text-white">{formatMoney(payable)}</span>
          </div>
          <button
            className="mx-auto flex min-h-[52px] w-full max-w-[430px] items-center justify-center rounded-2xl bg-[#FF9900] text-base font-black text-black transition hover:bg-[#F6A400] disabled:bg-[#2A2A2A] disabled:text-[#6B6B6B]"
            disabled={!canSubmit}
            type="submit"
          >
            {submitText}
          </button>
        </footer>
      </form>
    </main>
  );
}
