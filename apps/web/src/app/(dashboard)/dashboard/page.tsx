import { auth } from "@/lib/auth";
import { prisma } from "@creatorforge/database";
import { createYouTubeClient, type VideoData } from "@creatorforge/youtube";
import { redis } from "@/lib/redis";

async function getChannelData(userId: string) {
  // Find the user's Google refresh token
  const account = await prisma.account.findFirst({
    where: { userId, provider: "google" },
    select: { refresh_token: true },
  });

  if (!account?.refresh_token) return null;

  // Check cache first
  const cacheKey = `dashboard:${userId}`;
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached as string);

  // Fetch from YouTube
  const yt = createYouTubeClient(account.refresh_token);
  const stats = await yt.getMyChannel();
  const videos = await yt.getRecentVideos(10);

  const data = { stats, videos };

  // Cache for 5 minutes
  await redis.set(cacheKey, JSON.stringify(data), "EX", 300);

  // Sync to database in the background
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

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center h-full max-w-md mx-auto text-center space-y-6">
        <div className="rounded-full bg-muted p-4">
          <svg className="h-8 w-8 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
          </svg>
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
            await signIn("google", {
              redirectTo: "/dashboard",
            });
          }}
        >
          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-6 py-3 text-sm font-medium text-white hover:bg-brand-500 transition-colors"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0-3.897.266-4.356 2.62-4.385 8.816.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0 3.897-.266 4.356-2.62 4.385-8.816-.029-6.185-.484-8.549-4.385-8.816zm-10.615 12.816v-8l8 3.993-8 4.007z" />
            </svg>
            Connect YouTube Channel
          </button>
        </form>
        <p className="text-xs text-muted-foreground">
          We need YouTube access to pull your analytics. We never post without permission.
        </p>
      </div>
    );
  }

  const fmt = (n: number) => n.toLocaleString();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">{data.stats.channelName}</h1>
        <p className="text-muted-foreground">Channel Overview</p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Subscribers", value: fmt(data.stats.subscriberCount) },
          { label: "Total Views", value: fmt(data.stats.totalViews) },
          { label: "Total Videos", value: fmt(data.stats.totalVideos) },
          { label: "Recent Videos", value: String(data.videos.length) },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl border p-6">
            <p className="text-sm text-muted-foreground">{stat.label}</p>
            <p className="text-2xl font-bold mt-1">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Recent videos */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Recent Videos</h2>
        <div className="space-y-3">
          {data.videos.map((video: VideoData) => (
            <div
              key={video.videoId}
              className="flex items-center gap-4 rounded-lg border p-4"
            >
              {video.thumbnailUrl && (
                <img
                  src={video.thumbnailUrl}
                  alt=""
                  className="h-16 w-28 rounded object-cover"
                />
              )}
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{video.title}</p>
                <p className="text-sm text-muted-foreground">
                  {fmt(video.views)} views · {fmt(video.likes)} likes
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
