import { SkeletonBanner, SkeletonCardGrid, Skeleton } from '@/components/Skeleton';

export default function StudentHomeLoading() {
  return (
    <div className="space-y-8 max-w-6xl mx-auto py-2">
      <SkeletonBanner />
      <div className="space-y-4">
        <Skeleton className="h-3 w-40" />
        <SkeletonCardGrid cards={4} />
      </div>
    </div>
  );
}
