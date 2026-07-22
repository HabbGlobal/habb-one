export default function KioskEmployeeLoading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-habb-paper p-6 dark:bg-habb-black">
      <div className="flex flex-col items-center justify-center gap-6">
        <div className="relative h-24 w-24">
          <div className="absolute inset-0 rounded-full border-4 border-habb-line dark:border-habb-ink"></div>
          <div className="absolute inset-0 animate-spin rounded-full border-4 border-habb-red border-t-transparent"></div>
          <div className="absolute inset-2 animate-[spin_1.5s_linear_infinite_reverse] rounded-full border-4 border-habb-muted dark:border-habb-white border-t-transparent opacity-50"></div>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="h-3 w-3 animate-pulse rounded-full bg-habb-red"></div>
          </div>
        </div>
        <p className="animate-pulse text-lg font-semibold tracking-widest text-habb-ink dark:text-habb-white uppercase">
          Loading
        </p>
      </div>
    </main>
  );
}
