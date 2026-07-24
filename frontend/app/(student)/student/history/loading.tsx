import { Skeleton, SkeletonRows } from '@/components/Skeleton';

export default function Loading() {
  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-xl" />
        <div className="space-y-2">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-3 w-64" />
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
      </div>
      <SkeletonRows rows={5} />
    </div>
  );
}
