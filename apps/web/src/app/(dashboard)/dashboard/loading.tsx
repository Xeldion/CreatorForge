import { Skeleton } from "@/components/ui/skeleton";
import { StatCardSkeleton } from "@/components/dashboard/stat-card";
import { VideoListItemSkeleton } from "@/components/dashboard/video-list-item";

export default function DashboardLoading() {
  return (
    <div className="space-y-8 max-w-6xl">
      {/* Header skeleton */}
      <div className="space-y-2">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-4 w-32" />
      </div>

      {/* Stats grid skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <StatCardSkeleton key={i} />
        ))}
      </div>

      {/* Video list skeleton */}
      <section>
        <Skeleton className="h-7 w-36 mb-4" />
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <VideoListItemSkeleton key={i} />
          ))}
        </div>
      </section>
    </div>
  );
}
