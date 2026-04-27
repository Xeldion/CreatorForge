import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

export interface VideoListItemData {
  videoId: string;
  title: string;
  thumbnailUrl: string | null;
  views: number;
  likes: number;
  publishedAt: string;
  tags?: string[];
}

interface VideoListItemProps {
  video: VideoListItemData;
  className?: string;
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function timeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
  return `${Math.floor(diffDays / 365)}y ago`;
}

export function VideoListItem({ video, className }: VideoListItemProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-4 rounded-lg border p-4 hover:bg-muted/50 transition-colors",
        className
      )}
    >
      {/* Thumbnail */}
      {video.thumbnailUrl ? (
        <img
          src={video.thumbnailUrl}
          alt=""
          className="h-[68px] w-[120px] rounded-md object-cover bg-muted flex-shrink-0"
          loading="lazy"
        />
      ) : (
        <div className="h-[68px] w-[120px] rounded-md bg-muted flex-shrink-0" />
      )}

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">{video.title}</p>
        <div className="flex items-center gap-3 mt-1">
          <span className="text-xs text-muted-foreground">
            {formatNumber(video.views)} views
          </span>
          <span className="text-xs text-muted-foreground">·</span>
          <span className="text-xs text-muted-foreground">
            {formatNumber(video.likes)} likes
          </span>
          <span className="text-xs text-muted-foreground">·</span>
          <span className="text-xs text-muted-foreground">
            {timeAgo(video.publishedAt)}
          </span>
        </div>
        {video.tags && video.tags.length > 0 && (
          <div className="flex gap-1 mt-2 flex-wrap">
            {video.tags.slice(0, 3).map((tag) => (
              <Badge key={tag} variant="secondary" className="text-[10px]">
                {tag}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function VideoListItemSkeleton() {
  return (
    <div className="flex items-center gap-4 rounded-lg border p-4">
      <Skeleton className="h-[68px] w-[120px] rounded-md flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/3" />
      </div>
    </div>
  );
}
