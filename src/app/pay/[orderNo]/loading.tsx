export default function PayLoading() {
  return (
    <main className="min-h-screen bg-slate-100 px-3 py-4 text-slate-950">
      <section className="mx-auto flex min-h-[calc(100vh-32px)] w-full max-w-[430px] flex-col overflow-hidden rounded-[28px] bg-white shadow-xl shadow-slate-300/40">
        <div className="flex-1 px-5 py-5">
          <div className="mb-5 flex items-center justify-between">
            <div className="h-9 w-9 rounded-full bg-slate-100" />
            <div className="h-5 w-24 animate-pulse rounded bg-slate-200" />
            <div className="h-9 w-9" />
          </div>
          <div className="py-8 text-center">
            <div className="mx-auto h-3 w-24 animate-pulse rounded bg-slate-100" />
            <div className="mx-auto mt-3 h-12 w-40 animate-pulse rounded bg-slate-200" />
            <p className="mt-4 text-sm text-slate-500">正在加载订单...</p>
          </div>
          <div className="h-40 animate-pulse rounded-[24px] bg-slate-50" />
          <div className="mt-4 h-24 animate-pulse rounded-[24px] bg-blue-50" />
        </div>
        <div className="border-t border-slate-100 bg-white/95 p-4">
          <div className="h-[52px] animate-pulse rounded-2xl bg-blue-100" />
        </div>
      </section>
    </main>
  );
}
