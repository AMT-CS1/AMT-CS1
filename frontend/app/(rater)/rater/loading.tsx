import { SkeletonBanner, SkeletonRows, Skeleton } from '@/components/Skeleton';

export default function RaterLoading() {
  return (
    <div className="space-y-6 max-w-6xl">
      <SkeletonBanner />
      <div className="flex items-center gap-2 bg-white rounded-xl border border-slate-200 p-1.5 shadow-xs w-fit">
        <Skeleton className="h-8 w-44 rounded-lg" />
        <Skeleton className="h-8 w-36 rounded-lg" />
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
        <Skeleton className="h-3.5 w-52" />
        <SkeletonRows rows={5} />
      </div>
    </div>
  );
}
