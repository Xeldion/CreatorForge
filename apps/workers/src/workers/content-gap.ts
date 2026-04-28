import type { Job } from "bullmq";
import { analyzeContentGaps, type GapAnalysisResult } from "@creatorforge/strategy";

/**
 * Content Gap Analyzer Worker — v2
 *
 * Triggers the full 7-step pipeline with professional deterministic scoring.
 *
 * Pipeline:
 *   1. Discover top channels in niche (YouTube Data API)
 *   2. Fetch each channel's recent videos
 *   3. Classify video titles into topics/formats (LLM — language task)
 *   4. Estimate search demand (autocomplete + YT search counts)
 *   5. Score gaps (deterministic 5-component formula)
 *   6. Generate video ideas for top gaps (LLM — creative writing)
 *   7. Store in database + 7-day cache
 *
 * Job data:
 *   { userId: string, niche: string, refreshToken: string }
 */
export async function contentGapProcessor(
  job: Job
): Promise<GapAnalysisResult> {
  const { userId, niche, refreshToken } = job.data;

  console.info(
    `[content-gap] Job ${job.id}: Starting analysis for niche="${niche}"`
  );

  await job.updateProgress(5);

  // Validate inputs
  if (!userId || !niche || !refreshToken) {
    throw new Error(
      `Missing required job data: userId, niche, and refreshToken are required. ` +
        `Got userId=${!!userId} niche=${!!niche} refreshToken=${!!refreshToken}`
    );
  }

  if (niche.length < 3) {
    throw new Error(
      `Niche "${niche}" is too short. Must be at least 3 characters.`
    );
  }

  await job.updateProgress(10);

  // Run the full pipeline
  // Phases 1-2: YouTube API (channels + videos) — ~15-20s
  // Phase 3: LLM topic classification — ~5-10s
  // Phase 4: Demand estimation (autocomplete) — ~2-5s
  // Phase 5: Deterministic scoring — near-instant
  // Phase 6: LLM idea generation — ~5-10s
  // Phase 7: DB storage — near-instant
  const result = await analyzeContentGaps({
    userId,
    niche,
    refreshToken,
  });

  await job.updateProgress(90);

  // Detailed logging
  const topGap = result.gaps[0];
  console.info(
    `[content-gap] Job ${job.id}: Complete — ` +
    `${result.gaps.length} gaps from ${result.totalTopicsFound} topics, ` +
    `${result.totalChannelsAnalyzed} channels, ${result.totalVideosAnalyzed} videos.`
  );

  if (topGap) {
    console.info(
      `[content-gap] Top gap: "${topGap.topic}" (score: ${topGap.opportunityScore}/100, ` +
      `demand: ${topGap.demandScore}, supply-gap: ${topGap.supplyGapScore}, ` +
      `competition-quality: ${topGap.competitionQualityScore}, ` +
      `format-diversity: ${topGap.formatDiversityScore}, ` +
      `trend: ${topGap.trendScore}, RPM: ${topGap.estimatedRpm}, ` +
      `tier: ${topGap.opportunityTier})`
    );
  }

  // Cost estimate
  const llmCalls = result.totalTopicsFound > 0 ? 2 : 0; // classification + generation
  const llmCost =
    llmCalls > 0
      ? `$${(llmCalls * 0.08).toFixed(2)}-${(llmCalls * 0.2).toFixed(2)}`
      : "$0.00";
  console.info(
    `[content-gap] Job ${job.id}: Est. LLM cost: ${llmCost} (${llmCalls} calls)`
  );

  await job.updateProgress(100);

  return result;
}
