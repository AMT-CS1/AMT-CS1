import { Skeleton, SkeletonBanner, SkeletonText } from '@/components/Skeleton';

export default function ResearcherLoading() {
  return (
    <div className="space-y-8 max-w-4xl">
      <SkeletonBanner />
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs space-y-5">
        <Skeleton className="h-4 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <Skeleton className="h-2.5 w-24" />
              <Skeleton className="h-9 w-full rounded-lg" />
            </div>
          ))}
        </div>
        <SkeletonText lines={2} />
        <Skeleton className="h-11 w-40 rounded-xl" />
      </div>
    </div>
  );
}
