/**
 * Skeleton loading primitives + composites shared by route-level loading.tsx
 * files and client components while their data loads.
 */

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-slate-200/80 ${className}`} />;
}

/** Stacked text lines with varying widths. */
export function SkeletonText({ lines = 3, className = '' }: { lines?: number; className?: string }) {
  const widths = ['w-full', 'w-11/12', 'w-4/5', 'w-2/3', 'w-3/4'];
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={`h-2.5 ${widths[i % widths.length]}`} />
      ))}
    </div>
  );
}

/** Page header banner: icon square + title + subtitle. */
export function SkeletonBanner() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs flex items-start space-x-4">
      <Skeleton className="h-12 w-12 rounded-2xl shrink-0" />
      <div className="flex-1 space-y-2.5 py-1">
        <Skeleton className="h-4 w-56" />
        <Skeleton className="h-2.5 w-full max-w-xl" />
        <Skeleton className="h-2.5 w-3/4 max-w-lg" />
      </div>
    </div>
  );
}

/** One content card: header row with badge, text lines, footer button. */
export function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-slate-150 bg-white p-5 space-y-4 shadow-xs">
      <div className="flex items-center justify-between">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-5 w-20 rounded-full" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-3.5 w-2/3" />
        <SkeletonText lines={2} />
      </div>
      <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-8 w-28 rounded-xl" />
      </div>
    </div>
  );
}

/** Responsive grid of cards (homework / practicum / problems lists). */
export function SkeletonCardGrid({ cards = 4 }: { cards?: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
      {Array.from({ length: cards }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

/** Flat list rows (rater submissions list). */
export function SkeletonRows({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2.5">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="rounded-xl border border-slate-150 bg-white p-3.5 flex items-center gap-3">
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-3 w-40" />
            </div>
            <Skeleton className="h-2.5 w-32" />
          </div>
          <Skeleton className="h-5 w-20 rounded-full" />
          <Skeleton className="h-5 w-28 rounded-full" />
          <Skeleton className="h-7 w-20 rounded-lg" />
        </div>
      ))}
    </div>
  );
}

/** Larger stacked cards (rater feedback review). */
export function SkeletonFeedbackCards({ cards = 3 }: { cards?: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: cards }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-slate-150 bg-white p-4 space-y-3 shadow-xs">
          <div className="flex items-center justify-between">
            <Skeleton className="h-3 w-48" />
            <Skeleton className="h-5 w-28 rounded-full" />
          </div>
          <Skeleton className="h-12 w-full rounded-lg" />
          <Skeleton className="h-9 w-full rounded-lg" />
          <Skeleton className="h-16 w-full rounded-lg" />
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
            <Skeleton className="h-3 w-32" />
            <div className="flex gap-2">
              <Skeleton className="h-8 w-24 rounded-lg" />
              <Skeleton className="h-8 w-28 rounded-lg" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Solve-page shape: compact header bar over a two-panel editor split. */
export function SkeletonWorkspace() {
  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 flex items-center gap-3">
        <Skeleton className="h-7 w-7 rounded-lg shrink-0" />
        <div className="space-y-1.5 flex-1">
          <Skeleton className="h-2.5 w-40" />
          <Skeleton className="h-3 w-64" />
        </div>
        <Skeleton className="h-7 w-32 rounded-lg" />
        <Skeleton className="h-3 w-16" />
      </div>
      <div className="flex flex-col lg:flex-row gap-4">
        <div className="w-full lg:w-[42%] rounded-2xl border border-slate-200 bg-white p-4 space-y-3 shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <Skeleton className="h-3 w-36" />
            <Skeleton className="h-5 w-16 rounded-lg" />
          </div>
          <SkeletonText lines={6} />
          <Skeleton className="h-20 w-full rounded-xl" />
        </div>
        <div className="flex-1 flex flex-col gap-4">
          <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-xs">
            <div className="px-4 py-2.5 border-b border-slate-200 bg-slate-50/50 flex items-center justify-between">
              <Skeleton className="h-3 w-44" />
              <Skeleton className="h-7 w-32 rounded-lg" />
            </div>
            <Skeleton className="h-64 w-full rounded-none bg-slate-800/90" />
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
            <Skeleton className="h-16 w-full rounded-xl" />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Generic page skeleton: title block + card grid (instructor / researcher pages). */
export function SkeletonPage({ cards = 4 }: { cards?: number }) {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <Skeleton className="h-6 w-64" />
        <Skeleton className="h-2.5 w-96 max-w-full" />
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs space-y-5">
        <div className="flex items-center justify-between">
          <Skeleton className="h-3.5 w-56" />
          <Skeleton className="h-7 w-7 rounded-lg" />
        </div>
        <SkeletonCardGrid cards={cards} />
      </div>
    </div>
  );
}
