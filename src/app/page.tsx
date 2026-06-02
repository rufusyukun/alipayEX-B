import Link from "next/link";

export default function Home() {
  return (
    <main className="shell py-16">
      <section className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
        <div>
          <p className="mb-4 text-sm font-semibold uppercase tracking-[0.16em] text-blue-700">
            alipayEX
          </p>
          <h1 className="max-w-3xl text-4xl font-bold leading-tight text-slate-950 md:text-6xl">
            独立充值中心
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">
            alipayEX 负责充值订单、mock 支付、支付通知、余额入账和后台对账。
            外部业务系统只需要跳转到这里完成充值流程。
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link className="button" href="/recharge">
              进入充值页
            </Link>
            <Link className="button secondary" href="/admin/recharge">
              后台对账
            </Link>
          </div>
        </div>

        <div className="panel p-6">
          <div className="grid gap-4">
            {[
              ["充值页面", "面向用户创建充值订单"],
              ["mock 支付", "第一阶段验证支付主流程"],
              ["异步通知", "预留支付宝通知入口"],
              ["后台对账", "后续接入交易核对与入账审计"],
            ].map(([title, desc]) => (
              <div
                className="rounded-md border border-slate-200 bg-slate-50 p-4"
                key={title}
              >
                <h2 className="font-semibold text-slate-950">{title}</h2>
                <p className="mt-1 text-sm leading-6 text-slate-600">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
