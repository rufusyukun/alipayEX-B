export default function OrderQueryLoading() {
  return (
    <main className="min-h-screen bg-slate-100 px-3 py-4 text-slate-950">
      <section className="mx-auto min-h-[calc(100vh-32px)] w-full max-w-[430px] rounded-[28px] bg-white p-5 shadow-xl shadow-slate-300/40">
        <div className="h-8 w-32 animate-pulse rounded bg-slate-200" />
        <div className="mt-3 h-4 w-full animate-pulse rounded bg-slate-100" />
        <div className="mt-2 h-4 w-2/3 animate-pulse rounded bg-slate-100" />
        <div className="mt-6 h-12 animate-pulse rounded-2xl bg-slate-100" />
        <div className="mt-3 h-[52px] animate-pulse rounded-2xl bg-blue-100" />
        <p className="mt-5 text-center text-sm text-slate-500">正在加载订单查询...</p>
      </section>
    </main>
  );
}
