/**
 * Content Gap Analytics — Deterministic Scoring Engine
 *
 * Every function in this module is pure computation: formulas, lookups, and
 * statistics applied to structured input. No AI. No API calls. No side effects.
 *
 * Same input → same output. 100% testable.
 *
 * Sources:
 *   CONTENT-GAP-METHODOLOGY.md §3 (Scoring Algorithms)
 *   OutlierKit RPM data (Q1 2026)
 *   MilX CPM data (2025)
 */

// ============================================================================
// Types
// ============================================================================

export interface VideoStats {
  videoId: string;
  title: string;
  channelId: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  publishedAt: string; // ISO 8601
}

export interface ChannelStats {
  channelId: string;
  channelName: string;
  subscriberCount: number;
  totalViews: number;
}

export interface ClassifiedVideo {
  title: string;
  topic: string;
  format: VideoFormat;
  videoId: string;
  channelId: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  publishedAt: string;
}

export type VideoFormat =
  | "tutorial"
  | "review"
  | "listicle"
  | "vlog"
  | "explainer"
  | "challenge"
  | "reaction"
  | "commentary"
  | "other";

export type DemandLevel = "HIGH" | "MEDIUM" | "LOW";

export interface TopicDemand {
  topic: string;
  searchInterest: number; // 0-100 normalized
  trendDirection: number;  // -1 to +1 (declining → rising)
  autocompleteRank: number; // 0-10 (0 = not in autocomplete, 10 = top position)
}

export interface ScoredGap {
  topic: string;
  opportunityScore: number;        // 0-100, primary sort key
  demandScore: number;             // 0-100
  supplyGapScore: number;          // 0-100 (higher = fewer videos)
  competitionQualityScore: number; // 0-100 (higher = easier to beat)
  formatDiversityScore: number;    // 0-100
  trendScore: number;              // 0-100
  saturationIndex: number;         // computed index
  demandLevel: DemandLevel;
  competingVideos: number;
  competingChannels: number;
  outlierVideoIds: string[];
  topPerformingVideoIds: string[];
  underservedFormats: VideoFormat[];
  estimatedRpm: number;            // in dollars
}

export interface ScoringWeights {
  demand: number;
  supplyGap: number;
  competitionQuality: number;
  formatDiversity: number;
  trend: number;
}

// ============================================================================
// Default weights (tunable)
// ============================================================================

export const DEFAULT_WEIGHTS: ScoringWeights = {
  demand: 0.30,
  supplyGap: 0.30,
  competitionQuality: 0.15,
  formatDiversity: 0.10,
  trend: 0.15,
};

// ============================================================================
// RPM Lookup Table — Verified Q1 2026
// ============================================================================

export interface NicheRpm {
  category: string;
  keywords: string[];
  rpmRange: [number, number]; // [low, high]
  avgRpm: number;
}

const RPM_TABLE: NicheRpm[] = [
  { category: "Personal Finance & Investing", keywords: ["finance", "investing", "stock", "crypto", "money", "budget", "saving", "wealth", "retirement", "tax"], rpmRange: [6, 12], avgRpm: 8.00 },
  { category: "Business & Entrepreneurship", keywords: ["business", "startup", "entrepreneur", "saas", "marketing", "sales", "ecommerce", "dropshipping", "side hustle", "passive income"], rpmRange: [4, 10], avgRpm: 6.50 },
  { category: "Legal / Law", keywords: ["legal", "law", "lawyer", "attorney", "court", "lawsuit", "rights"], rpmRange: [5, 10], avgRpm: 7.00 },
  { category: "Real Estate", keywords: ["real estate", "property", "house", "apartment", "mortgage", "rental", "airbnb", "flipping"], rpmRange: [4, 9], avgRpm: 6.00 },
  { category: "Tech Reviews / Gadgets", keywords: ["tech", "gadget", "review", "phone", "laptop", "apple", "samsung", "android", "iphone", "camera", "drone"], rpmRange: [3, 9], avgRpm: 5.50 },
  { category: "Software Development", keywords: ["programming", "coding", "developer", "software", "javascript", "python", "react", "web dev", "api", "database"], rpmRange: [3, 8], avgRpm: 5.00 },
  { category: "AI & Machine Learning", keywords: ["ai", "artificial intelligence", "machine learning", "chatgpt", "llm", "deep learning", "neural network", "prompt"], rpmRange: [3, 9], avgRpm: 5.50 },
  { category: "Health & Fitness", keywords: ["health", "fitness", "workout", "gym", "weight loss", "muscle", "nutrition", "exercise", "diet", "bodybuilding"], rpmRange: [3, 8], avgRpm: 5.00 },
  { category: "Digital Marketing", keywords: ["marketing", "seo", "social media", "ads", "google ads", "facebook ads", "tiktok", "instagram", "content", "branding"], rpmRange: [3, 8], avgRpm: 5.00 },
  { category: "Education & Online Learning", keywords: ["education", "learning", "study", "course", "tutorial", "school", "college", "university", "teacher", "student"], rpmRange: [3, 7], avgRpm: 4.50 },
  { category: "Travel", keywords: ["travel", "vacation", "trip", "destination", "backpacking", "hotel", "flight", "wanderlust", "budget travel"], rpmRange: [2, 7], avgRpm: 4.00 },
  { category: "Lifestyle & Vlogging", keywords: ["lifestyle", "vlog", "daily", "routine", "morning", "home", "decor", "fashion", "beauty"], rpmRange: [2, 6], avgRpm: 3.50 },
  { category: "Cooking & Food", keywords: ["cooking", "food", "recipe", "baking", "meal", "kitchen", "chef", "restaurant", "dinner", "breakfast"], rpmRange: [2, 5], avgRpm: 3.00 },
  { category: "Gaming", keywords: ["gaming", "game", "minecraft", "fortnite", "gta", "valorant", "roblox", "gameplay", "esports", "stream"], rpmRange: [1, 4], avgRpm: 2.50 },
  { category: "Entertainment", keywords: ["entertainment", "funny", "comedy", "prank", "challenge", "reaction", "viral", "memes"], rpmRange: [1, 3], avgRpm: 2.00 },
  { category: "Music", keywords: ["music", "song", "guitar", "piano", "beat", "rap", "hip hop", "cover", "producer", "dj"], rpmRange: [1, 3], avgRpm: 1.50 },
  { category: "Motivational / Self-Improvement", keywords: ["motivation", "self improvement", "productivity", "mindset", "discipline", "habits", "goals", "success", "stoic"], rpmRange: [3, 7], avgRpm: 4.00 },
  { category: "Science & Education", keywords: ["science", "physics", "chemistry", "biology", "space", "universe", "experiment", "math", "history", "geography"], rpmRange: [3, 7], avgRpm: 4.50 },
  { category: "ASMR / Sleep / Wellness", keywords: ["asmr", "sleep", "relax", "meditation", "wellness", "healing", "soundscape", "ambient", "calm"], rpmRange: [3, 8], avgRpm: 5.00 },
];

/**
 * Match a niche string to RPM data using keyword overlap.
 * Returns the average RPM for the best-matching category, or a safe default.
 */
export function estimateRpm(niche: string, videoDurationSeconds?: number): number {
  const nicheLower = niche.toLowerCase();
  let bestMatch: NicheRpm | null = null;
  let bestScore = 0;

  for (const entry of RPM_TABLE) {
    let score = 0;
    for (const kw of entry.keywords) {
      if (nicheLower.includes(kw)) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      bestMatch = entry;
    }
  }

  let rpm = bestMatch?.avgRpm ?? 4.00; // default: mid-range RPM

  // Duration adjustment
  if (videoDurationSeconds) {
    if (videoDurationSeconds >= 480) rpm *= 1.2;      // 8+ min = mid-roll ads
    else if (videoDurationSeconds < 180) rpm *= 0.7;   // <3 min = no mid-roll
  }

  return Math.round(rpm * 100) / 100;
}

/**
 * Return the full RPM category info for display purposes.
 */
export function getNicheRpmCategory(niche: string): NicheRpm | null {
  const nicheLower = niche.toLowerCase();
  let bestMatch: NicheRpm | null = null;
  let bestScore = 0;

  for (const entry of RPM_TABLE) {
    let score = 0;
    for (const kw of entry.keywords) {
      if (nicheLower.includes(kw)) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      bestMatch = entry;
    }
  }

  return bestMatch;
}

// ============================================================================
// Outlier Detection
// ============================================================================

const OUTLIER_THRESHOLD = 3.0;   // 3x channel average
const STRONG_OUTLIER = 10.0;     // 10x channel average

/**
 * Detect outlier videos — ones that dramatically outperform their channel's
 * average. These are demand signals: if a video on topic X got 10x normal
 * views, topic X has proven demand.
 */
export interface OutlierResult {
  videoId: string;
  channelId: string;
  viewRatio: number;   // video views ÷ channel average
  isOutlier: boolean;  // > 3x
  isStrongOutlier: boolean; // > 10x
}

export function detectOutliers(
  videos: ClassifiedVideo[],
  channels: ChannelStats[]
): OutlierResult[] {
  // Compute average views per channel
  const channelAvgViews = new Map<string, number>();
  const channelVideoCount = new Map<string, number>();

  for (const v of videos) {
    const count = (channelVideoCount.get(v.channelId) ?? 0) + 1;
    channelVideoCount.set(v.channelId, count);
    const sum = (channelAvgViews.get(v.channelId) ?? 0) + v.viewCount;
    channelAvgViews.set(v.channelId, sum);
  }

  const avgMap = new Map<string, number>();
  for (const [chId, sum] of Array.from(channelAvgViews)) {
    const count = channelVideoCount.get(chId) ?? 1;
    avgMap.set(chId, sum / count);
  }

  const results: OutlierResult[] = [];
  for (const v of videos) {
    const avg = avgMap.get(v.channelId) ?? 1;
    const ratio = v.viewCount / Math.max(avg, 1);
    results.push({
      videoId: v.videoId,
      channelId: v.channelId,
      viewRatio: Math.round(ratio * 100) / 100,
      isOutlier: ratio >= OUTLIER_THRESHOLD,
      isStrongOutlier: ratio >= STRONG_OUTLIER,
    });
  }

  return results;
}

// ============================================================================
// Saturation Index
// ============================================================================

/**
 * How "crowded" a topic is, accounting for both video count AND
 * the authority of channels covering it.
 *
 * SATURATION_INDEX = (video_count × avg_views × channel_authority) / search_interest
 *
 * 0-2   = Low saturation (green zone)
 * 2-5   = Medium (yellow)
 * 5-10  = High (orange)
 * 10+   = Over-saturated (red)
 */
export function calculateSaturationIndex(
  videoCount: number,
  channelIds: Set<string>,
  avgViews: number,
  channels: Map<string, ChannelStats>,
  searchInterest: number // 0-100 from demand estimation
): number {
  if (searchInterest <= 0) return 999; // no demand → meaningless

  // Authority factor: log10 of average subscriber count, normalized
  let totalSubs = 0;
  let channelCount = 0;
  for (const chId of Array.from(channelIds)) {
    const ch = channels.get(chId);
    if (ch) {
      totalSubs += Math.log10(Math.max(ch.subscriberCount, 1));
      channelCount++;
    }
  }
  const avgAuthority = channelCount > 0 ? totalSubs / channelCount : 1;
  const authorityFactor = avgAuthority / 6; // normalize (log10(1M) ≈ 6)

  const safeSearch = Math.max(searchInterest, 1);
  const raw = (videoCount * Math.max(avgViews, 1) * Math.max(authorityFactor, 0.1)) / safeSearch;

  return Math.round(raw * 100) / 100;
}

/**
 * Human-readable label for saturation index.
 */
export function saturationLabel(index: number): string {
  if (index <= 2) return "Low — attack this topic";
  if (index <= 5) return "Medium — differentiate your angle";
  if (index <= 10) return "High — niche down further";
  return "Over-saturated — avoid unless you have a unique angle";
}

// ============================================================================
// Format Diversity Scoring
// ============================================================================

const ALL_FORMATS: VideoFormat[] = [
  "tutorial", "review", "listicle", "vlog",
  "explainer", "challenge", "reaction", "commentary",
];

/**
 * Scores a topic by how underserved certain formats are.
 * High score = many formats have zero or few videos on this topic.
 * This rewards topics where you could use a unique format.
 */
export function calculateFormatDiversity(
  formatCounts: Map<VideoFormat, number>,
  totalVideos: number
): { score: number; underservedFormats: VideoFormat[] } {
  if (totalVideos === 0) {
    return { score: 100, underservedFormats: [...ALL_FORMATS] };
  }

  const ratios = new Map<VideoFormat, number>();
  let maxRatio = 0;

  for (const fmt of ALL_FORMATS) {
    const count = formatCounts.get(fmt) ?? 0;
    const ratio = count / totalVideos;
    ratios.set(fmt, ratio);
    if (ratio > maxRatio) maxRatio = ratio;
  }

  // Score: inverted most-saturated format ratio
  let score = 100 - maxRatio * 100;

  // Bonus: +20 if 2+ formats have zero videos
  const zeroFormatCount = ALL_FORMATS.filter((f) => (formatCounts.get(f) ?? 0) === 0).length;
  if (zeroFormatCount >= 2) score += 20;

  // Find underserved formats (ratio < 10%)
  const underserved: VideoFormat[] = [];
  for (const fmt of ALL_FORMATS) {
    if ((ratios.get(fmt) ?? 0) < 0.1) {
      underserved.push(fmt);
    }
  }

  return {
    score: Math.min(100, Math.max(0, Math.round(score))),
    underservedFormats: underserved,
  };
}

// ============================================================================
// Competition Quality Score
// ============================================================================

/**
 * Higher = easier to beat existing content.
 * Rewards topics where existing videos are from small channels,
 * have low views, or are old/stale.
 */
export function calculateCompetitionQuality(
  videos: ClassifiedVideo[],
  channels: Map<string, ChannelStats>
): number {
  if (videos.length === 0) return 100;

  // Average channel authority (inverted)
  let totalAuth = 0;
  for (const v of videos) {
    const ch = channels.get(v.channelId);
    const subs = ch?.subscriberCount ?? 1;
    totalAuth += Math.log10(Math.max(subs, 1)) / 7; // normalize (log10(10M) ≈ 7)
  }
  const avgAuth = totalAuth / videos.length;

  // Average views score (inverted)
  const avgViews = videos.reduce((s, v) => s + v.viewCount, 0) / videos.length;
  const viewsScore = Math.min(avgViews / 500000, 1); // normalize (500K views = 1)

  // Content freshness: fraction of videos newer than 90 days
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const fresh = videos.filter((v) => new Date(v.publishedAt) > cutoff).length;
  const freshnessRatio = fresh / videos.length;

  const raw = avgAuth * 0.4 + viewsScore * 0.4 + freshnessRatio * 0.2;

  // Invert: high authority/high views = low competition quality score
  return Math.round(Math.min(100, Math.max(0, (1 - raw) * 100)));
}

// ============================================================================
// Supply Gap Score
// ============================================================================

/**
 * Higher = fewer quality videos on this topic relative to demand.
 * Core gap signal: the demand-to-supply ratio.
 */
export function calculateSupplyGapScore(
  videoCount: number,
  searchInterest: number
): number {
  const safeInterest = Math.max(searchInterest, 1);
  const supplyRatio = videoCount / Math.sqrt(safeInterest);

  // Normalize against a reasonable max
  const maxRatio = 50; // 50 videos / sqrt(1) = very oversupplied
  return Math.round(Math.min(100, Math.max(0, 100 - (supplyRatio * 100 / maxRatio))));
}

// ============================================================================
// Trend Score
// ============================================================================

/**
 * Computes a trend score from the search interest direction.
 * trendDirection: -1 (strong decline) to +1 (strong growth)
 */
export function calculateTrendScore(trendDirection: number): number {
  // Neutral = 50. Full growth = 100. Full decline = 0.
  const score = 50 + trendDirection * 50;
  return Math.round(Math.min(100, Math.max(0, score)));
}

// ============================================================================
// Main Opportunity Score
// ============================================================================

export function calculateOpportunityScore(
  demandScore: number,
  supplyGapScore: number,
  competitionQualityScore: number,
  formatDiversityScore: number,
  trendScore: number,
  weights: ScoringWeights = DEFAULT_WEIGHTS
): number {
  const raw =
    demandScore * weights.demand +
    supplyGapScore * weights.supplyGap +
    competitionQualityScore * weights.competitionQuality +
    formatDiversityScore * weights.formatDiversity +
    trendScore * weights.trend;

  return Math.round(Math.min(100, Math.max(0, raw)));
}

// ============================================================================
// Recency Weighting
// ============================================================================

/**
 * Half-life for video recency decay (in days).
 * A video τ days old counts as 0.5 of a fresh video in supply calculations.
 * Tune per niche — 60 days is a good default for fast-moving topics.
 */
export const RECENCY_HALF_LIFE_DAYS = 60;

/**
 * Computes an exponential decay weight for a video based on its age.
 * weight = 2^(-ageDays / halfLife)
 *
 * Fresh video (0 days)   → 1.0
 * Half-life old          → 0.5
 * Double half-life       → 0.25
 */
export function recencyWeight(publishedAt: string, halfLifeDays: number = RECENCY_HALF_LIFE_DAYS): number {
  const ageMs = Date.now() - new Date(publishedAt).getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  return Math.pow(2, -ageDays / halfLifeDays);
}

// ============================================================================
// Gap Scoring — Full Pipeline
// ============================================================================

/**
 * Runs the full deterministic scoring pipeline on classified videos.
 *
 * @param classified - Videos grouped by topic and format (from LLM classification)
 * @param channels - Channel stats keyed by channelId
 * @param demandData - Demand estimation results per topic
 * @param weights - Scoring weights (uses defaults if not provided)
 * @returns Scored gaps sorted by opportunityScore descending
 */
export function scoreGaps(
  classified: ClassifiedVideo[],
  channels: Map<string, ChannelStats>,
  demandData: Map<string, TopicDemand>,
  weights: ScoringWeights = DEFAULT_WEIGHTS
): ScoredGap[] {
  // Group classified videos by topic
  const byTopic = new Map<string, ClassifiedVideo[]>();
  for (const v of classified) {
    const key = v.topic.toLowerCase().trim();
    if (!byTopic.has(key)) byTopic.set(key, []);
    byTopic.get(key)!.push(v);
  }

  // Run outlier detection across ALL videos first
  const allOutliers = detectOutliers(classified, Array.from(channels.values()));
  const outlierByVideo = new Map<string, OutlierResult>();
  for (const o of allOutliers) {
    outlierByVideo.set(o.videoId, o);
  }

  const gaps: ScoredGap[] = [];

  for (const [topic, videos] of Array.from(byTopic.entries())) {
    const demand = demandData.get(topic) ?? {
      topic,
      searchInterest: 50,
      trendDirection: 0,
      autocompleteRank: 0,
    };

    const channelIds = new Set(videos.map((v) => v.channelId));
    const avgViews = videos.reduce((s, v) => s + v.viewCount, 0) / videos.length;

    // Recency-weighted effective video count: old videos count less for supply calculations.
    // A 60-day-old video counts as 0.5x, a 120-day-old counts as 0.25x, etc.
    const effectiveVideoCount = videos.reduce(
      (sum, v) => sum + recencyWeight(v.publishedAt),
      0
    );

    // Count formats per topic
    const formatCounts = new Map<VideoFormat, number>();
    for (const v of videos) {
      formatCounts.set(v.format, (formatCounts.get(v.format) ?? 0) + 1);
    }

    // Compute component scores
    const demandScore = Math.round(demand.searchInterest);
    // Supply gap & saturation use effective (recency-weighted) count so old videos
    // don't make a topic look oversupplied when it's actually wide open today.
    const supplyGapScore = calculateSupplyGapScore(effectiveVideoCount, demand.searchInterest);
    const competitionQualityScore = calculateCompetitionQuality(videos, channels);
    const { score: formatDiversityScore, underservedFormats } = calculateFormatDiversity(formatCounts, videos.length);
    const trendScore = calculateTrendScore(demand.trendDirection);
    const saturationIndex = calculateSaturationIndex(
      effectiveVideoCount, channelIds, avgViews, channels, demand.searchInterest
    );

    // Collect outlier and top-performing videos on this topic
    const outlierIds: string[] = [];
    const topIds: string[] = [];
    for (const v of videos) {
      const outlier = outlierByVideo.get(v.videoId);
      if (outlier?.isOutlier) outlierIds.push(v.videoId);
    }
    // Top by absolute views (top 3)
    const sorted = [...videos].sort((a, b) => b.viewCount - a.viewCount);
    for (let i = 0; i < Math.min(3, sorted.length); i++) {
      topIds.push(sorted[i].videoId);
    }

    // Determine demand level
    let demandLevel: DemandLevel = "MEDIUM";
    if (demand.searchInterest >= 70) demandLevel = "HIGH";
    else if (demand.searchInterest < 30) demandLevel = "LOW";

    const opportunityScore = calculateOpportunityScore(
      demandScore,
      supplyGapScore,
      competitionQualityScore,
      formatDiversityScore,
      trendScore,
      weights
    );

    // Estimate RPM from niche (use topic itself as niche approximation)
    const nicheRpm = estimateRpm(topic);

    gaps.push({
      topic,
      opportunityScore,
      demandScore,
      supplyGapScore,
      competitionQualityScore,
      formatDiversityScore,
      trendScore,
      saturationIndex,
      demandLevel,
      competingVideos: videos.length,
      competingChannels: channelIds.size,
      outlierVideoIds: outlierIds,
      topPerformingVideoIds: topIds,
      underservedFormats,
      estimatedRpm: nicheRpm,
    });
  }

  // Sort by opportunity score descending
  gaps.sort((a, b) => b.opportunityScore - a.opportunityScore);

  return gaps;
}

// ============================================================================
// Grouping Helpers
// ============================================================================

/**
 * Human-readable opportunity tier label.
 */
export function opportunityTier(score: number): string {
  if (score >= 80) return "Gold Mine";
  if (score >= 60) return "Strong Opportunity";
  if (score >= 40) return "Worth Exploring";
  return "High Competition";
}
