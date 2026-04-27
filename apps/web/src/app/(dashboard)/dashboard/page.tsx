import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createYouTubeClient, type VideoData } from "@creatorforge/youtube";
import { redis } from "@/lib/redis";
import { StatCard } from "@/components/dashboard/stat-card";
import { VideoListItem } from "@/components/dashboard/video-list-item";
import { BarChart3, Users, PlayCircle, Video } from "lucide-react";

async function getChannelData(userId: string) {
  const account = await prisma.account.findFirst({
    where: { userId, provider: "google" },
    select: { refresh_token: true },
  });

  if (!account?.refresh_token) return null;

  const cacheKey = `dashboard:${userId}`;
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached as string);

  const yt = createYouTubeClient(account.refresh_token);
  let stats;
  let videos: VideoData[] = [];

  try {
    stats = await yt.getMyChannel();
    videos = await yt.getRecentVideos(10);
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (message.includes("No YouTube channel")) {
      return { noChannel: true };
    }
    throw err;
  }

  const data = { stats, videos };
  await redis.set(cacheKey, JSON.stringify(data), "EX", 300);

  await prisma.channel.upsert({
    where: { youtubeChannelId: stats.channelId },
    update: {
      channelName: stats.channelName,
      thumbnailUrl: stats.thumbnailUrl,
      subscriberCount: stats.subscriberCount,
      totalViews: stats.totalViews,
      totalVideos: stats.totalVideos,
      statsUpdatedAt: new Date(),
    },
    create: {
      userId,
      youtubeChannelId: stats.channelId,
      channelName: stats.channelName,
      thumbnailUrl: stats.thumbnailUrl,
      subscriberCount: stats.subscriberCount,
      totalViews: stats.totalViews,
      totalVideos: stats.totalVideos,
    },
  });

  return data;
}

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) return null;

  const userId = (session.user as { id: string }).id;
  const data = await getChannelData(userId);

  // Not connected state (no refresh token)
  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center h-full max-w-md mx-auto text-center space-y-6">
        <div className="rounded-full bg-muted p-5">
          <PlayCircle className="h-10 w-10 text-muted-foreground" />
        </div>
        <h2 className="text-2xl font-bold">Connect Your YouTube Channel</h2>
        <p className="text-muted-foreground">
          Link your YouTube account to unlock analytics, content strategy, and AI-powered
          thumbnail A/B testing.
        </p>
        <form
          action={async () => {
            "use server";
            const { signIn } = await import("@/lib/auth");
            await signIn("google", { redirectTo: "/dashboard" });
          }}
        >
          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-6 py-3 text-sm font-medium text-white hover:bg-brand-500 transition-colors shadow-sm"
          >
            <PlayCircle className="h-5 w-5" />
            Connect YouTube Channel
          </button>
        </form>
        <p className="text-xs text-muted-foreground">
          We request YouTube access to pull your analytics.
          We never post without your permission.
        </p>
      </div>
    );
  }

  // No YouTube channel on this account
  if ("noChannel" in data) {
    return (
      <div className="flex flex-col items-center justify-center h-full max-w-md mx-auto text-center space-y-6">
        <div className="rounded-full bg-amber-500/10 p-5">
          <PlayCircle className="h-10 w-10 text-amber-500" />
        </div>
        <h2 className="text-2xl font-bold">No YouTube Channel Found</h2>
        <p className="text-muted-foreground">
          This Google account doesn&apos;t have a YouTube channel. Create one at{" "}
          <a href="https://youtube.com/create_channel" className="text-brand-500 underline" target="_blank">
            youtube.com/create_channel
          </a>
          {" "}or sign in with a different Google account that has a channel.
        </p>
      </div>
    );
  }

  const fmt = (n: number): string =>
    n >= 1_000_000
      ? `${(n / 1_000_000).toFixed(1)}M`
      : n >= 1_000
        ? `${(n / 1_000).toFixed(1)}K`
        : String(n);

  return (
    <div className="space-y-8 max-w-6xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          {data.stats.channelName}
        </h1>
        <p className="text-muted-foreground mt-1">Channel Overview</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Subscribers" value={fmt(data.stats.subscriberCount)} icon={Users} trend={{ value: "This session", positive: true }} />
        <StatCard label="Total Views" value={fmt(data.stats.totalViews)} icon={BarChart3} />
        <StatCard label="Total Videos" value={fmt(data.stats.totalVideos)} icon={Video} />
        <StatCard label="Recent Videos" value={String(data.videos.length)} icon={PlayCircle} />
      </div>

      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Recent Videos</h2>
          <span className="text-xs text-muted-foreground">Cached · Updates every 5 minutes</span>
        </div>
        <div className="space-y-3">
          {data.videos.map((video: VideoData) => (
            <VideoListItem
              key={video.videoId}
              video={{
                videoId: video.videoId,
                title: video.title,
                thumbnailUrl: video.thumbnailUrl,
                views: video.views,
                likes: video.likes,
                publishedAt: video.publishedAt,
                tags: video.tags,
              }}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
