import { google, youtube_v3 } from "googleapis";
import { z } from "zod";

// ============================================================================
// Types
// ============================================================================

export interface YouTubeClient {
  getMyChannel(): Promise<ChannelStats>;
  getRecentVideos(maxResults?: number): Promise<VideoData[]>;
  getVideoStats(videoIds: string[]): Promise<VideoData[]>;
  searchChannels(query: string, maxResults?: number): Promise<ChannelInfo[]>;
  getChannelVideos(channelId: string, maxResults?: number): Promise<VideoData[]>;
  uploadThumbnail(videoId: string, imageBuffer: Buffer): Promise<void>;
}

export interface ChannelStats {
  channelId: string;
  channelName: string;
  thumbnailUrl: string | null;
  subscriberCount: number;
  totalViews: number;
  totalVideos: number;
}

export interface ChannelInfo {
  channelId: string;
  channelName: string;
  thumbnailUrl: string | null;
  subscriberCount: number;
  description: string;
}

export interface VideoData {
  videoId: string;
  title: string;
  thumbnailUrl: string | null;
  publishedAt: string;
  views: number;
  likes: number;
  comments: number;
  duration: string | null;
  tags: string[];
  categoryId: string | null;
}

// ============================================================================
// OAuth2 Client Factory
// ============================================================================

function createOAuth2Client(refreshToken: string) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.YOUTUBE_CLIENT_ID,
    process.env.YOUTUBE_CLIENT_SECRET,
    `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/callback/google`
  );
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  return oauth2Client;
}

// ============================================================================
// YouTube Client Implementation
// ============================================================================

export function createYouTubeClient(refreshToken: string): YouTubeClient {
  const auth = createOAuth2Client(refreshToken);
  const yt = google.youtube({ version: "v3", auth });

  return {
    async getMyChannel() {
      const res = await yt.channels.list({
        part: ["statistics", "snippet"],
        mine: true,
      });

      const channel = res.data.items?.[0];
      if (!channel) throw new Error("No YouTube channel found for this account");

      return {
        channelId: channel.id!,
        channelName: channel.snippet?.title ?? "Unknown",
        thumbnailUrl: channel.snippet?.thumbnails?.default?.url ?? null,
        subscriberCount: parseInt(channel.statistics?.subscriberCount ?? "0"),
        totalViews: parseInt(channel.statistics?.viewCount ?? "0"),
        totalVideos: parseInt(channel.statistics?.videoCount ?? "0"),
      };
    },

    async getRecentVideos(maxResults = 10) {
      const channelRes = await yt.channels.list({
        part: ["contentDetails"],
        mine: true,
      });

      const uploadsPlaylistId =
        channelRes.data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
      if (!uploadsPlaylistId) throw new Error("No uploads playlist found");

      const playlistRes = await yt.playlistItems.list({
        part: ["snippet", "contentDetails"],
        playlistId: uploadsPlaylistId,
        maxResults,
      });

      const videoIds =
        playlistRes.data.items
          ?.map((item) => item.contentDetails?.videoId)
          .filter(Boolean) ?? [];

      return this.getVideoStats(videoIds as string[]);
    },

    async getVideoStats(videoIds: string[]) {
      if (videoIds.length === 0) return [];

      const res = await yt.videos.list({
        part: ["statistics", "snippet", "contentDetails"],
        id: videoIds,
      });

      return (res.data.items ?? []).map((video) => ({
        videoId: video.id!,
        title: video.snippet?.title ?? "Untitled",
        thumbnailUrl: video.snippet?.thumbnails?.default?.url ?? null,
        publishedAt: video.snippet?.publishedAt ?? "",
        views: parseInt(video.statistics?.viewCount ?? "0"),
        likes: parseInt(video.statistics?.likeCount ?? "0"),
        comments: parseInt(video.statistics?.commentCount ?? "0"),
        duration: video.contentDetails?.duration ?? null,
        tags: video.snippet?.tags ?? [],
        categoryId: video.snippet?.categoryId ?? null,
      }));
    },

    async searchChannels(query: string, maxResults = 50) {
      const res = await yt.search.list({
        part: ["snippet"],
        q: query,
        type: ["channel"],
        maxResults,
        order: "relevance",
      });

      const channelIds =
        res.data.items?.map((item) => item.snippet?.channelId).filter(Boolean) ?? [];

      if (channelIds.length === 0) return [];

      // Fetch subscriber counts in a separate call
      const statsRes = await yt.channels.list({
        part: ["statistics", "snippet"],
        id: channelIds as string[],
      });

      return (statsRes.data.items ?? []).map((channel) => ({
        channelId: channel.id!,
        channelName: channel.snippet?.title ?? "Unknown",
        thumbnailUrl: channel.snippet?.thumbnails?.default?.url ?? null,
        subscriberCount: parseInt(channel.statistics?.subscriberCount ?? "0"),
        description: channel.snippet?.description ?? "",
      }));
    },

    async getChannelVideos(channelId: string, maxResults = 50) {
      const res = await yt.search.list({
        part: ["snippet"],
        channelId,
        type: ["video"],
        order: "date",
        maxResults,
        publishedAfter: new Date(
          Date.now() - 180 * 24 * 60 * 60 * 1000
        ).toISOString(), // Last 6 months
      });

      const videoIds =
        res.data.items?.map((item) => item.id?.videoId).filter(Boolean) ?? [];

      return this.getVideoStats(videoIds as string[]);
    },

    async uploadThumbnail(videoId: string, imageBuffer: Buffer) {
      await yt.thumbnails.set({
        videoId,
        media: {
          mimeType: "image/png",
          body: imageBuffer,
        },
      });
    },
  };
}
