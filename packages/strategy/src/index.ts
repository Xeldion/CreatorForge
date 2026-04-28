/**
 * Content Gap Analyzer — Main Pipeline
 *
 * v2 — Now with professional deterministic scoring engine.
 *
 * Pipeline:
 *   1. Discover channels (YouTube Data API)
 *   2. Fetch videos (YouTube Data API)
 *   3. Classify topics via LLM (DeepSeek — language task only)
 *   4. Estimate demand (autocomplete + YT search + simulated in DEV)
 *   5. Score gaps (pure deterministic math — see analytics.ts)
 *   6. Generate video ideas via LLM (DeepSeek — creative writing only)
 *   7. Store in PostgreSQL
 *
 * Architecture:
 *   Math pipeline: steps 2, 4, 5  → Deterministic, testable
 *   LLM pipeline:  steps 3, 6     → Language tasks, Zod-validated
 */

import { prisma } from "@creatorforge/database";
import { createYouTubeClient } from "@creatorforge/youtube";
import { chatStructured } from "@creatorforge/ai";
import { google } from "googleapis";
import { z } from "zod";
import {
  scoreGaps,
  estimateRpm,
  opportunityTier,
  type ScoredGap,
  type ChannelStats,
  type ClassifiedVideo,
  type VideoFormat,
  DEFAULT_WEIGHTS,
} from "./analytics";
import { estimateDemand } from "./demand";

// ============================================================================
// Types
// ============================================================================

export interface GapAnalysisInput {
  userId: string;
  niche: string;
  refreshToken: string;
}

export interface ContentGapSuggestion {
  topic: string;
  // Scores
  opportunityScore: number;
  demandScore: number;
  supplyGapScore: number;
  competitionQualityScore: number;
  formatDiversityScore: number;
  trendScore: number;
  // Quantified metrics
  demandLevel: "HIGH" | "MEDIUM" | "LOW";
  saturationIndex: number;
  competingVideos: number;
  competingChannels: number;
  // Generated content
  suggestedTitles: string[];
  suggestedTags: string[];
  scriptOutline: string;
  thumbnailConcept: string;
  estimatedRpm: string;
  whyThisGap: string;
  // Display
  opportunityTier: string;
  underservedFormats: string[];
}

export interface GapAnalysisResult {
  gaps: ContentGapSuggestion[];
  totalChannelsAnalyzed: number;
  totalVideosAnalyzed: number;
  totalTopicsFound: number;
  nicheTrends: string[];
  completedAt: string;
  scoringWeights: typeof DEFAULT_WEIGHTS;
}

// ============================================================================
// Zod schemas for structured LLM output
// ============================================================================

const TopicClassification = z.object({
  videoId: z.string(),
  title: z.string(),
  topic: z.string(),
  format: z.string().transform((f) => f.toLowerCase().trim()).pipe(
    z.enum([
      "tutorial",
      "review",
      "listicle",
      "vlog",
      "explainer",
      "challenge",
      "reaction",
      "commentary",
      "other",
    ]).or(z.string().transform(() => "other" as const))
  ),
});

const TopicClassificationSchema = z.object({
  topics: z.array(TopicClassification),
});

const ContentGapItem = z.object({
  topic: z.string(),
  searchVolumeEstimate: z.enum(["HIGH", "MEDIUM", "LOW"]),
  competitionScore: z.number().min(0).max(100),
  opportunityScore: z.number().min(0).max(100),
  suggestedTitles: z.array(z.string()).length(3),
  suggestedTags: z.array(z.string()),
  scriptOutline: z.string(),
  thumbnailConcept: z.string(),
  estimatedRpm: z.string(),
  whyThisGap: z.string(),
});

const ContentGapIdeasSchema = z.object({
  gaps: z.array(ContentGapItem),
  nicheTrends: z.array(z.string()),
});

// ============================================================================
// Step 1: Discover top channels in the niche
// ============================================================================

async function discoverChannels(
  refreshToken: string,
  niche: string,
  maxChannels = 8
) {
  const yt = createYouTubeClient(refreshToken);

  const searchResults = await yt.searchChannels(niche, maxChannels * 2);

  // Weight by log subscriber count to balance signal diversity:
  //   - Micro creators (< 1k) surface emerging trends early
  //   - Large creators (> 500k) indicate market saturation / proven topics
  // The scoring engine already uses log(subCount) internally, so extremes
  // won't distort the math — we just need to make sure they're included.
  // Sort by subscribers descending to prioritize established channels.
  searchResults.sort((a, b) => b.subscriberCount - a.subscriberCount);

  return searchResults.slice(0, maxChannels);
}

// ============================================================================
// Step 2: Fetch each channel's recent videos
// ============================================================================

async function fetchAllChannelVideos(
  refreshToken: string,
  channelIds: string[],
  maxPerChannel = 15
) {
  const yt = createYouTubeClient(refreshToken);
  const allVideos: {
    videoId: string;
    title: string;
    channelId: string;
    viewCount: number;
    likeCount: number;
    commentCount: number;
    publishedAt: string;
  }[] = [];

  for (const channelId of channelIds) {
    try {
      const videos = await yt.getChannelVideos(channelId, maxPerChannel);
      for (const video of videos) {
        allVideos.push({
          videoId: video.videoId,
          title: video.title,
          channelId,
          viewCount: video.views ?? 0,
          likeCount: video.likes ?? 0,
          commentCount: video.comments ?? 0,
          publishedAt: video.publishedAt ?? new Date().toISOString(),
        });
      }
    } catch (err) {
      console.warn(
        `[content-gap] Skipping channel ${channelId}:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  return allVideos;
}

// ============================================================================
// Step 3: Extract topics via LLM
// ============================================================================

async function classifyTopics(
  videos: { videoId: string; title: string }[],
  niche: string,
  batchSize = 50
): Promise<{ videoId: string; title: string; topic: string; format: string }[]> {
  const results: { videoId: string; title: string; topic: string; format: string }[] = [];

  for (let i = 0; i < videos.length; i += batchSize) {
    const batch = videos.slice(i, i + batchSize);
    // Build title list with videoId references for the LLM
    const titleLines = batch.map((v) => `${v.videoId} | ${v.title}`).join("\n");

    const classified = await chatStructured(
      [
        {
          role: "system",
          content: `You are a YouTube content strategist. Classify each video title by topic and format within the "${niche}" niche.

Group similar titles under the same topic name. Be specific — "React Hooks Tutorial" is better than "Programming".

Format must be exactly one of these lowercase values: tutorial, review, listicle, vlog, explainer, challenge, reaction, commentary, other.

Return EXACTLY this JSON structure, no other fields:
{
  "topics": [
    {"videoId": "the video id", "title": "exact video title here", "topic": "topic name", "format": "tutorial"},
    ...
  ]
}

Every input videoId/title pair MUST appear in the output array with its own entry. Preserve the exact videoId as given. Do not nest videos under topics.`,
        },
        {
          role: "user",
          content: `Classify these ${batch.length} video titles into topics and formats. Each line has the format "videoId | title":\n\n${titleLines}\n\nRespond with valid JSON following the exact structure specified.`,
        },
      ],
      TopicClassificationSchema,
      { temperature: 0.3 }
    );

    for (const item of classified.topics) {
      results.push({
        videoId: item.videoId,
        title: item.title,
        topic: item.topic,
        format: item.format,
      });
    }
  }

  return results;
}

// ============================================================================
// Step 5-6 (NEW): Score gaps using deterministic engine + generate ideas
// ============================================================================

/**
 * Merges classification results with video stats to create ClassifiedVideo[].
 * Then scores them using the deterministic analytics engine.
 */
function buildScoredGaps(
  classified: { videoId: string; title: string; topic: string; format: string }[],
  videos: {
    videoId: string;
    title: string;
    channelId: string;
    viewCount: number;
    likeCount: number;
    commentCount: number;
    publishedAt: string;
  }[],
  channels: ChannelStats[],
  demandMap: Map<string, { topic: string; searchInterest: number; trendDirection: number; autocompleteRank: number }>
): ScoredGap[] {
  // Build video lookup by videoId (was: by title — fragile)
  const videoById = new Map<string, typeof videos[number]>();
  for (const v of videos) {
    videoById.set(v.videoId, v);
  }

  // Build channel lookup
  const channelMap = new Map<string, ChannelStats>();
  for (const ch of channels) {
    channelMap.set(ch.channelId, ch);
  }

  // Merge into ClassifiedVideo[] using videoId joins
  const classifiedVideos: ClassifiedVideo[] = [];
  let mergeFailures = 0;
  for (const c of classified) {
    const v = videoById.get(c.videoId);
    if (v) {
      classifiedVideos.push({
        title: c.title,
        topic: c.topic,
        format: c.format as VideoFormat,
        videoId: v.videoId,
        channelId: v.channelId,
        viewCount: v.viewCount,
        likeCount: v.likeCount,
        commentCount: v.commentCount,
        publishedAt: v.publishedAt,
      });
    } else {
      mergeFailures++;
    }
  }

  if (mergeFailures > 0) {
    console.warn(
      `[strategy] buildScoredGaps: ${mergeFailures}/${classified.length} classified videos ` +
      `could not be matched to source videos by videoId. LLM may have altered videoIds.`
    );
  }

  // Run full deterministic scoring
  return scoreGaps(classifiedVideos, channelMap, demandMap, DEFAULT_WEIGHTS);
}

// ============================================================================
// Step 6 (continued): Generate video ideas for top gaps (LLM)
// ============================================================================

function scoreTier(score: number): string {
  if (score >= 80) return "TOP_10%";
  if (score >= 60) return "HIGH";
  if (score >= 40) return "MID";
  return "LOW";
}

async function generateVideoIdeas(
  niche: string,
  scoredGaps: ScoredGap[],
  demandMap: Map<string, { searchInterest: number }>
): Promise<ContentGapSuggestion[]> {
  const gapsForLLM = scoredGaps.slice(0, 10);

  // Use tier labels (TOP_10%/HIGH/MID/LOW) instead of exact numeric scores
  // to avoid the LLM pattern-matching on numbers when generating creative copy.
  const demandStr = gapsForLLM
    .map(
      (g) =>
        `- "${g.topic}" | opportunity: ${scoreTier(g.opportunityScore)} | demand: ${scoreTier(g.demandScore)} | supply-gap: ${scoreTier(g.supplyGapScore)} | competition-quality: ${scoreTier(g.competitionQualityScore)} | trend: ${scoreTier(g.trendScore)} | RPM: ~$${g.estimatedRpm}`
    )
    .join("\n");

  const result = await chatStructured(
    [
      {
        role: "system",
        content: `You are a YouTube content strategist with deep knowledge of the "${niche}" niche.

For each content gap below, generate concrete video ideas. Be specific — not "make a tutorial" but "How to X in 5 Minutes (Even If You're a Beginner)".

Scoring tier definitions:
- TOP_10%: exceptional opportunity — very high demand, very low supply, or both
- HIGH: strong opportunity — worth prioritizing
- MID: moderate opportunity — decent but competitive
- LOW: low opportunity — available but challenging

- opportunity: composite of all dimensions below
- demand: how many people search for this topic
- supply-gap: how few quality videos exist (high = underserved)
- competition-quality: how easy it is to beat existing videos (high = easier)
- trend: is interest growing? (high = rising, mid = flat, low = declining)

You MUST respond with a single JSON object (wrapped in { } not [ ]) with this exact structure:
{
  "gaps": [
    {
      "topic": "topic name",
      "searchVolumeEstimate": "HIGH",
      "competitionScore": 75,
      "opportunityScore": 82,
      "suggestedTitles": ["title variant 1", "title variant 2", "title variant 3"],
      "suggestedTags": ["tag1", "tag2", "tag3", "tag4", "tag5"],
      "scriptOutline": "Hook: ... | Key points: 1) ... 2) ... 3) ... | CTA: ...",
      "thumbnailConcept": "visual description",
      "estimatedRpm": "$8-15",
      "whyThisGap": "1-2 sentence explanation citing the opportunity level and gap dimensions"
    }
  ],
  "nicheTrends": ["trend summary 1", "trend summary 2"]
}

Important: Respond with ONLY the JSON object, no markdown code blocks, no surrounding text.`,
      },
      {
        role: "user",
        content: `Generate video ideas for these content gaps in the "${niche}" niche:\n\n${demandStr}`,
      },
    ],
    ContentGapIdeasSchema,
    { temperature: 0.8 }
  );

  // Merge LLM-generated content with deterministic scores
  const mergedGaps: ContentGapSuggestion[] = [];
  for (let i = 0; i < result.gaps.length; i++) {
    const llmGap = result.gaps[i];
    const scored = gapsForLLM[i];

    mergedGaps.push({
      topic: llmGap.topic,
      opportunityScore: scored?.opportunityScore ?? llmGap.opportunityScore,
      demandScore: scored?.demandScore ?? 50,
      supplyGapScore: scored?.supplyGapScore ?? 50,
      competitionQualityScore: scored?.competitionQualityScore ?? 50,
      formatDiversityScore: scored?.formatDiversityScore ?? 50,
      trendScore: scored?.trendScore ?? 50,
      demandLevel: scored?.demandLevel ?? llmGap.searchVolumeEstimate,
      saturationIndex: scored?.saturationIndex ?? 0,
      competingVideos: scored?.competingVideos ?? 0,
      competingChannels: scored?.competingChannels ?? 0,
      suggestedTitles: llmGap.suggestedTitles,
      suggestedTags: llmGap.suggestedTags,
      scriptOutline: llmGap.scriptOutline,
      thumbnailConcept: llmGap.thumbnailConcept,
      estimatedRpm: scored
        ? `$${scored.estimatedRpm}`
        : llmGap.estimatedRpm,
      whyThisGap: llmGap.whyThisGap,
      opportunityTier: scored
        ? opportunityTier(scored.opportunityScore)
        : "Unknown",
      underservedFormats: scored?.underservedFormats ?? [],
    });
  }

  // Build niche trends summary
  const nicheTrends = result.nicheTrends;

  return mergedGaps;
}

// ============================================================================
// Step 7: Store results in PostgreSQL
// ============================================================================

async function storeResults(
  userId: string,
  niche: string,
  gaps: ContentGapSuggestion[]
) {
  await prisma.contentGap.deleteMany({
    where: { userId, niche },
  });

  await prisma.contentGap.createMany({
    data: gaps.map((gap) => ({
      userId,
      niche,
      topic: gap.topic,
      searchVolumeEstimate: gap.demandLevel,
      competitionScore: gap.competitionQualityScore,
      suggestedTitles: gap.suggestedTitles,
      suggestedTitle: gap.suggestedTitles[0] ?? gap.topic,
      suggestedTags: gap.suggestedTags,
      scriptOutline: gap.scriptOutline,
      thumbnailConcept: gap.thumbnailConcept,
      opportunityScore: gap.opportunityScore,
      estimatedRpm: gap.estimatedRpm,
    })),
  });
}

// ============================================================================
// Helpers
// ============================================================================

function mapPrismaToGap(gap: {
  topic: string;
  searchVolumeEstimate: string | null;
  competitionScore: number | null;
  opportunityScore: number;
  suggestedTitles: unknown;
  suggestedTags: unknown;
  scriptOutline: string | null;
  thumbnailConcept: string | null;
  estimatedRpm: string | null;
}): ContentGapSuggestion {
  const titles = Array.isArray(gap.suggestedTitles)
    ? (gap.suggestedTitles as string[])
    : typeof gap.suggestedTitles === "string"
      ? [gap.suggestedTitles]
      : [gap.topic];

  const tags = Array.isArray(gap.suggestedTags)
    ? (gap.suggestedTags as string[])
    : [];

  return {
    topic: gap.topic,
    opportunityScore: gap.opportunityScore,
    demandScore: 50,
    supplyGapScore: 50,
    competitionQualityScore: gap.competitionScore ?? 50,
    formatDiversityScore: 50,
    trendScore: 50,
    demandLevel:
      (gap.searchVolumeEstimate as ContentGapSuggestion["demandLevel"]) ??
      "MEDIUM",
    saturationIndex: 0,
    competingVideos: 0,
    competingChannels: 0,
    suggestedTitles: titles,
    suggestedTags: tags,
    scriptOutline: gap.scriptOutline ?? "",
    thumbnailConcept: gap.thumbnailConcept ?? "",
    estimatedRpm: gap.estimatedRpm ?? "$3-8",
    whyThisGap: "Previously analyzed — run a fresh analysis for detailed insights.",
    opportunityTier: opportunityTier(gap.opportunityScore),
    underservedFormats: [],
  };
}

// ============================================================================
// Development Mode — Skip YouTube API, use realistic mock data
// ============================================================================

const MOCK_CHANNEL_POOLS: Record<string, string[]> = {
  default: [
    "TechWithTim", "Fireship", "Theo - t3.gg", "Kevin Powell",
    "Web Dev Simplified", "Jack Herrington", "Lee Robinson",
    "Josh tried coding", "Beyond Fireship", "Program With Erik",
  ],
  printer: [
    "Maker's Muse", "CNC Kitchen", "Teaching Tech", "3D Printing Nerd",
    "Thomas Sanladerer", "CHEP", "Uncle Jessy", "Prusa 3D",
    "Zack Freedman", "3DJake",
  ],
  gaming: [
    "Game Maker's Toolkit", "Dani", "DevDuck", "ThinMatrix",
    "Sebastian Lague", "Code Bullet", "Mizu", "Aarthificial",
    "Blackthornprod", "Goodgis",
  ],
  cooking: [
    "Joshua Weissman", "Babish Culinary Universe", "Ethan Chlebowski",
    "J. Kenji López-Alt", "Brian Lagerstrom", "Chef Jean-Pierre",
    "Adam Ragusea", "Pro Home Cooks", "NOT ANOTHER COOKING SHOW", "Middle Eats",
  ],
  fitness: [
    "Jeff Nippard", "Jeremy Ethier", "Athlean-X", "Sean Nalewanyj",
    "Renaissance Periodization", "Noel Deyzel", "Will Tennyson",
    "ScottHermanFitness", "Mario Tomic", "Geoffrey Verity Schofield",
  ],
};

function generateMockVideos(
  niche: string,
  channelName: string,
  count: number
): {
  videoId: string;
  title: string;
  channelId: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  publishedAt: string;
}[] {
  const templates = [
    `The Ultimate ${niche} Guide for Beginners (2026)`,
    `I Tried ${niche} for 30 Days — Here's What Happened`,
    `${niche} Tips That Actually Work (I Tested Them All)`,
    `Why ${niche} Is Harder Than You Think`,
    `${niche} vs Traditional Methods — Honest Comparison`,
    `My Complete ${niche} Setup (Everything You Need)`,
    `${niche} Mistakes I Wish I Knew Earlier`,
    `The FASTEST Way to Learn ${niche}`,
    `${niche} on a Budget — What Actually Matters`,
    `I Asked Experts About ${niche} — Here's What They Said`,
    `${niche} Workflow That Saves Me Hours`,
    `${niche}: From Zero to First Project`,
    `5 ${niche} Tricks Nobody Talks About`,
    `${niche} Trends to Watch in 2026`,
    `Common ${niche} Questions Answered`,
  ];
  return Array.from({ length: Math.min(count, templates.length) }, (_, i) => ({
    videoId: `mock-${channelName.replace(/\s+/g, "-")}-${i}`,
    title: templates[i] || `${niche} Tutorial #${i + 1}`,
    channelId: `mock-ch-${channelName.replace(/\s+/g, "-")}`,
    viewCount: 5000 + Math.floor(Math.random() * 100000),
    likeCount: 200 + Math.floor(Math.random() * 5000),
    commentCount: 30 + Math.floor(Math.random() * 500),
    publishedAt: new Date(
      Date.now() - Math.floor(Math.random() * 90) * 24 * 60 * 60 * 1000
    ).toISOString(),
  }));
}

function getMockChannels(niche: string): ChannelStats[] {
  const nicheLower = niche.toLowerCase();
  let pool = MOCK_CHANNEL_POOLS.default;

  if (nicheLower.includes("print") || nicheLower.includes("3d"))
    pool = MOCK_CHANNEL_POOLS.printer;
  else if (nicheLower.includes("game") || nicheLower.includes("dev"))
    pool = MOCK_CHANNEL_POOLS.gaming;
  else if (nicheLower.includes("cook") || nicheLower.includes("food") || nicheLower.includes("recipe"))
    pool = MOCK_CHANNEL_POOLS.cooking;
  else if (
    nicheLower.includes("fit") ||
    nicheLower.includes("gym") ||
    nicheLower.includes("workout")
  )
    pool = MOCK_CHANNEL_POOLS.fitness;

  return pool.slice(0, 8).map((name, i) => ({
    channelId: `mock-ch-${i}`,
    channelName: name,
    subscriberCount: 50_000 + Math.floor(Math.random() * 200_000),
    totalViews: 1_000_000 + Math.floor(Math.random() * 10_000_000),
  }));
}

async function runDevPipeline(
  niche: string
): Promise<GapAnalysisResult> {
  console.info(`[strategy] DEVELOPMENT_MODE: using mock data for "${niche}"`);

  const channels = getMockChannels(niche);
  const allVideos: {
    videoId: string;
    title: string;
    channelId: string;
    viewCount: number;
    likeCount: number;
    commentCount: number;
    publishedAt: string;
  }[] = [];
  for (const ch of channels) {
    const videos = generateMockVideos(niche, ch.channelName, 15);
    allVideos.push(...videos);
  }

  // LLM: classify video titles into topics and formats
  const classified = await classifyTopics(allVideos, niche, 50);

  // Extract unique topics for demand estimation
  const topicSet = new Set<string>();
  for (const c of classified) {
    topicSet.add(c.topic.toLowerCase().trim());
  }
  const topics = Array.from(topicSet).slice(0, 15);

  // Estimate demand (simulated in DEV mode)
  const demandMap = await estimateDemand(topics);

  // Deterministic scoring
  const scoredGaps = buildScoredGaps(
    classified,
    allVideos,
    channels,
    demandMap
  );

  // LLM: generate video ideas for top gaps
  const gapIdeas = await generateVideoIdeas(niche, scoredGaps, demandMap);

  return {
    gaps: gapIdeas,
    totalChannelsAnalyzed: channels.length,
    totalVideosAnalyzed: allVideos.length,
    totalTopicsFound: topics.length,
    nicheTrends: scoredGaps.slice(0, 5).map(
      (g) => `${g.topic} (score: ${g.opportunityScore}, demand: ${g.demandLevel}, RPM: $${g.estimatedRpm})`
    ),
    completedAt: new Date().toISOString(),
    scoringWeights: DEFAULT_WEIGHTS,
  };
}

// ============================================================================
// Main pipeline
// ============================================================================

export async function analyzeContentGaps(
  input: GapAnalysisInput
): Promise<GapAnalysisResult> {
  const { userId, niche, refreshToken } = input;

  // Check 7-day cache first
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const cached = await prisma.contentGap.findFirst({
    where: { userId, niche, generatedAt: { gte: sevenDaysAgo } },
    orderBy: { generatedAt: "desc" },
  });

  if (cached) {
    const gaps = await prisma.contentGap.findMany({
      where: { userId, niche },
      orderBy: { opportunityScore: "desc" },
    });

    return {
      gaps: gaps.map(mapPrismaToGap),
      totalChannelsAnalyzed: 0,
      totalVideosAnalyzed: 0,
      totalTopicsFound: gaps.length,
      nicheTrends: ["Cached result from " + cached.generatedAt.toISOString()],
      completedAt: new Date().toISOString(),
      scoringWeights: DEFAULT_WEIGHTS,
    };
  }

  // Development mode: skip YouTube API, use mock data + real LLM
  if (process.env.DEVELOPMENT_MODE === "true") {
    const result = await runDevPipeline(niche);
    await storeResults(userId, niche, result.gaps);
    return result;
  }

  // === PRODUCTION PATH ===

  // Step 1: Discover channels
  const channels = await discoverChannels(refreshToken, niche, 8);
  if (channels.length === 0) {
    throw new Error(
      `No channels found for niche "${niche}". Try a broader search.`
    );
  }

  // Step 2: Fetch videos
  const channelIds = channels.map((c) => c.channelId);
  const videos = await fetchAllChannelVideos(refreshToken, channelIds, 15);

  if (videos.length === 0) {
    throw new Error(
      `No videos found from channels in "${niche}". Try a different niche.`
    );
  }

  // Step 3: Classify topics (LLM)
  const classified = await classifyTopics(videos, niche, 50);

  // Extract unique topics
  const topicSet = new Set<string>();
  for (const c of classified) {
    topicSet.add(c.topic.toLowerCase().trim());
  }
  const topics = Array.from(topicSet).slice(0, 15);

  // Step 4: Estimate demand (autocomplete + YT search)
  const demandMap = await estimateDemand(topics, refreshToken);

  // Build channel stats for scoring
  const channelStats: ChannelStats[] = channels.map((ch) => ({
    channelId: ch.channelId,
    channelName: ch.channelName,
    subscriberCount: ch.subscriberCount,
    totalViews: 0, // Not available from ChannelInfo without extra API calls
  }));

  // Step 5: Score gaps (deterministic)
  const scoredGaps = buildScoredGaps(classified, videos, channelStats, demandMap);

  // Step 6: Generate video ideas (LLM)
  const gapIdeas = await generateVideoIdeas(niche, scoredGaps, demandMap);

  // Step 7: Store in DB
  await storeResults(userId, niche, gapIdeas);

  // Step 8: Build niche trends summary
  const nicheTrends = scoredGaps.slice(0, 5).map(
    (g) =>
      `${g.topic} (score: ${g.opportunityScore}, demand: ${g.demandLevel}, RPM: $${g.estimatedRpm})`
  );

  return {
    gaps: gapIdeas,
    totalChannelsAnalyzed: channels.length,
    totalVideosAnalyzed: videos.length,
    totalTopicsFound: topics.length,
    nicheTrends,
    completedAt: new Date().toISOString(),
    scoringWeights: DEFAULT_WEIGHTS,
  };
}
