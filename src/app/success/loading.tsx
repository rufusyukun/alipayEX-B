export default function SuccessLoading() {
  return (
    <main className="min-h-screen bg-slate-100 px-3 py-4 text-slate-950">
      <section className="mx-auto min-h-[calc(100vh-32px)] w-full max-w-[430px] rounded-[28px] bg-white px-5 pb-8 pt-[90px] text-center shadow-xl shadow-slate-300/40">
        <div className="mx-auto mb-5 h-16 w-16 animate-pulse rounded-full bg-blue-50" />
        <h1 className="text-2xl font-black">正在确认支付结果</h1>
        <p className="mt-3 text-sm text-slate-500">请稍候...</p>
        <div className="mt-8 h-32 animate-pulse rounded-[24px] bg-slate-50" />
      </section>
    </main>
  );
}
