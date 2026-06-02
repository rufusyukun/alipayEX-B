export default function RechargeLoading() {
  return (
    <main className="min-h-[100dvh] bg-slate-100 px-3 text-slate-950">
      <section className="mx-auto min-h-[100dvh] w-full max-w-[430px] bg-white px-4 pt-4 shadow-xl shadow-slate-300/40 sm:rounded-[28px]">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <div className="h-6 w-24 animate-pulse rounded bg-slate-200" />
            <div className="mt-2 h-3 w-40 animate-pulse rounded bg-slate-100" />
          </div>
          <div className="h-3 w-16 animate-pulse rounded bg-slate-100" />
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          {Array.from({ length: 6 }).map((_, index) => (
            <div className="min-h-[96px] animate-pulse rounded-[20px] border border-slate-100 bg-slate-50 p-3.5" key={index}>
              <div className="h-6 w-16 rounded bg-slate-200" />
              <div className="mt-4 h-3 w-24 rounded bg-slate-100" />
            </div>
          ))}
        </div>
        <div className="mt-4 h-24 animate-pulse rounded-[22px] bg-slate-50" />
        <div className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-100 bg-white/95 px-3 pt-3 pb-[max(14px,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(15,23,42,0.08)]">
          <div className="mx-auto w-full max-w-[430px]">
            <div className="mb-3 h-7 w-28 animate-pulse rounded bg-slate-200" />
            <div className="h-[52px] animate-pulse rounded-2xl bg-blue-100" />
          </div>
        </div>
      </section>
    </main>
  );
}
