/**
 * GET /api/strategy/gaps — Fetch stored content gaps for the current user
 *
 * Returns the most recent analysis results. If none exist, returns an empty array.
 * Results are cached in PostgreSQL for 7 days.
 *
 * Query params:
 *   ?niche= — Return gaps for a specific niche (case-insensitive match)
 */
 
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET(req?: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = (session.user as { id: string }).id;
  const requestedNiche = req ? new URL(req.url).searchParams.get("niche") : null;

  let niche: string | null = null;
  let generatedAt: Date | null = null;

  if (requestedNiche) {
    // Exact match first, then case-insensitive fallback
    const exact = await prisma.contentGap.findFirst({
      where: { userId, niche: requestedNiche },
      select: { niche: true, generatedAt: true },
    });
    if (exact) {
      niche = exact.niche;
      generatedAt = exact.generatedAt;
    } else {
      // Try case-insensitive match
      const ci = await prisma.contentGap.findFirst({
        where: {
          userId,
          niche: { equals: requestedNiche, mode: "insensitive" },
        },
        select: { niche: true, generatedAt: true },
      });
      niche = ci?.niche ?? null;
      generatedAt = ci?.generatedAt ?? null;
    }
  } else {
    // No niche specified — fall back to most recent (backward compat)
    const latest = await prisma.contentGap.findFirst({
      where: { userId },
      orderBy: { generatedAt: "desc" },
      select: { niche: true, generatedAt: true },
    });
    niche = latest?.niche ?? null;
    generatedAt = latest?.generatedAt ?? null;
  }

  if (!niche) {
    return NextResponse.json({
      gaps: [],
      niche: null,
      generatedAt: null,
      message: "No analyses yet. Run your first content gap analysis.",
    });
  }

  // Get all gaps for that niche
  const gaps = await prisma.contentGap.findMany({
    where: { userId, niche },
    orderBy: { opportunityScore: "desc" },
  });

  return NextResponse.json({
    gaps: gaps.map((g) => ({
      id: g.id,
      topic: g.topic,
      searchVolumeEstimate: g.searchVolumeEstimate,
      competitionScore: g.competitionScore,
      opportunityScore: g.opportunityScore,
      suggestedTitles: g.suggestedTitles,
      suggestedTags: g.suggestedTags,
      scriptOutline: g.scriptOutline,
      thumbnailConcept: g.thumbnailConcept,
      estimatedRpm: g.estimatedRpm,
    })),
    niche,
    generatedAt: generatedAt?.toISOString() ?? null,
  });
}
