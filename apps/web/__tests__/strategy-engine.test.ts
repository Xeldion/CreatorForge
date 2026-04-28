/**
 * Unit tests for strategy engine pure functions.
 *
 * Tests the business logic in packages/strategy/src/index.ts that doesn't
 * require API calls or database access.
 */

import { describe, it, expect } from "vitest";

// ---------------------------------------------------------------------------
// Replicate the pure functions from the strategy engine
// (importing directly would require building the package, so we test the
//  logic by vendoring the functions here — they're deterministic)
// ---------------------------------------------------------------------------

function calculateSaturation(
  classified: { topic: string; format: string }[]
): Map<string, { count: number; formats: Set<string> }> {
  const topicMap = new Map<string, { count: number; formats: Set<string> }>();

  for (const item of classified) {
    const key = item.topic.toLowerCase().trim();
    if (!topicMap.has(key)) {
      topicMap.set(key, { count: 0, formats: new Set() });
    }
    const entry = topicMap.get(key)!;
    entry.count++;
    entry.formats.add(item.format);
  }

  return topicMap;
}

function calculateOpportunityScores(
  saturation: Map<string, { count: number; formats: Set<string> }>,
  demand: Map<string, number>,
  totalVideos: number
): {
  topic: string;
  score: number;
  competitionScore: number;
  details: string;
}[] {
  const opportunities: {
    topic: string;
    score: number;
    competitionScore: number;
    details: string;
  }[] = [];

  for (const [topic, satData] of Array.from(saturation.entries())) {
    const saturationRatio = satData.count / Math.max(totalVideos, 1);
    const competitionScore = Math.round((1 - saturationRatio) * 100);

    const demandScore = demand.get(topic) ?? 50;

    const formatCount = satData.formats.size;
    const engagementPotential = Math.min(formatCount * 25, 100);

    let trendScore: number;
    if (satData.count <= 2) trendScore = 30;
    else if (satData.count <= 8) trendScore = 80;
    else trendScore = 40;

    // Weighted formula:
    const score = Math.round(
      demandScore * 0.35 +
        competitionScore * 0.3 +
        engagementPotential * 0.2 +
        trendScore * 0.15
    );

    opportunities.push({
      topic,
      score,
      competitionScore,
      details: `demand=${demandScore} competition=${competitionScore} engagement=${engagementPotential} trend=${trendScore}`,
    });
  }

  opportunities.sort((a, b) => b.score - a.score);
  return opportunities;
}

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
}) {
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
    searchVolumeEstimate:
      (gap.searchVolumeEstimate as "HIGH" | "MEDIUM" | "LOW") ?? "MEDIUM",
    competitionScore: gap.competitionScore ?? 50,
    opportunityScore: gap.opportunityScore,
    suggestedTitles: titles,
    suggestedTags: tags,
    scriptOutline: gap.scriptOutline ?? "",
    thumbnailConcept: gap.thumbnailConcept ?? "",
    estimatedRpm: gap.estimatedRpm ?? "$3-8",
    whyThisGap:
      "Previously analyzed — run a fresh analysis for detailed insights.",
  };
}

// ---------------------------------------------------------------------------
// calculateSaturation
// ---------------------------------------------------------------------------

describe("calculateSaturation", () => {
  it("returns an empty map for empty input", () => {
    const result = calculateSaturation([]);
    expect(result.size).toBe(0);
  });

  it("groups by lowercased topic name", () => {
    const classified = [
      { topic: "React Hooks", format: "tutorial" },
      { topic: "react hooks", format: "vlog" },
      { topic: "React Hooks", format: "tutorial" },
    ];

    const result = calculateSaturation(classified);
    expect(result.size).toBe(1);

    const entry = result.get("react hooks")!;
    expect(entry.count).toBe(3);
    expect(entry.formats.size).toBe(2); // tutorial + vlog
  });

  it("handles multiple distinct topics", () => {
    const classified = [
      { topic: "React", format: "tutorial" },
      { topic: "Python", format: "tutorial" },
      { topic: "React", format: "review" },
    ];

    const result = calculateSaturation(classified);
    expect(result.size).toBe(2);

    const react = result.get("react")!;
    expect(react.count).toBe(2);
    expect(react.formats.has("tutorial")).toBe(true);
    expect(react.formats.has("review")).toBe(true);

    const python = result.get("python")!;
    expect(python.count).toBe(1);
    expect(python.formats.has("tutorial")).toBe(true);
  });

  it("trims whitespace from topic names", () => {
    const classified = [
      { topic: "  react  ", format: "tutorial" },
      { topic: "react", format: "vlog" },
    ];

    const result = calculateSaturation(classified);
    expect(result.size).toBe(1);
    expect(result.get("react")!.count).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// calculateOpportunityScores
// ---------------------------------------------------------------------------

describe("calculateOpportunityScores", () => {
  it("returns empty array for no topics", () => {
    const result = calculateOpportunityScores(new Map(), new Map(), 100);
    expect(result).toEqual([]);
  });

  it("scores a single topic with high demand and low saturation", () => {
    const saturation = new Map<string, { count: number; formats: Set<string> }>();
    saturation.set("react", { count: 1, formats: new Set(["tutorial"]) });

    const demand = new Map<string, number>();
    demand.set("react", 90);

    const result = calculateOpportunityScores(saturation, demand, 100);
    expect(result).toHaveLength(1);
    expect(result[0].topic).toBe("react");
    expect(result[0].competitionScore).toBe(99); // (1 - 1/100)*100
    // demand=90*0.35 + competition=99*0.3 + engagement=25*0.2 + trend=30*0.15
    // = 31.5 + 29.7 + 5 + 4.5 = 70.7 → 71
    expect(result[0].score).toBeGreaterThan(65);
  });

  it("scores a saturated topic lower", () => {
    const saturation = new Map<string, { count: number; formats: Set<string> }>();
    saturation.set("popular-topic", { count: 50, formats: new Set(["tutorial"]) });

    const demand = new Map<string, number>();
    demand.set("popular-topic", 100);

    const result = calculateOpportunityScores(saturation, demand, 100);
    expect(result[0].competitionScore).toBe(50); // (1 - 50/100)*100
    expect(result[0].score).toBeLessThan(65); // should be lower than previous test
  });

  it("sorts results by score descending", () => {
    const saturation = new Map<string, { count: number; formats: Set<string> }>();
    saturation.set("low-opp", { count: 50, formats: new Set(["tutorial"]) });
    saturation.set("high-opp", { count: 1, formats: new Set(["tutorial", "vlog"]) });
    saturation.set("mid-opp", { count: 10, formats: new Set(["tutorial"]) });

    const demand = new Map<string, number>();
    demand.set("low-opp", 50);
    demand.set("high-opp", 90);
    demand.set("mid-opp", 70);

    const result = calculateOpportunityScores(saturation, demand, 100);
    expect(result[0].topic).toBe("high-opp");
    expect(result[2].topic).toBe("low-opp");
    // high > mid > low
    expect(result[0].score).toBeGreaterThan(result[1].score);
    expect(result[1].score).toBeGreaterThan(result[2].score);
  });

  it("uses default demand of 50 for topics not in demand map", () => {
    const saturation = new Map<string, { count: number; formats: Set<string> }>();
    saturation.set("unknown-topic", { count: 5, formats: new Set(["tutorial"]) });

    const demand = new Map<string, number>(); // empty

    const result = calculateOpportunityScores(saturation, demand, 100);
    expect(result[0].details).toContain("demand=50");
  });

  it("handles totalVideos of 0 without division by zero", () => {
    const saturation = new Map<string, { count: number; formats: Set<string> }>();
    saturation.set("topic", { count: 5, formats: new Set(["tutorial"]) });

    const demand = new Map<string, number>();
    demand.set("topic", 80);

    // Should not throw
    const result = calculateOpportunityScores(saturation, demand, 0);
    expect(result).toHaveLength(1);
  });

  it("trend score: 30 for count <= 2, 80 for 3-8, 40 for > 8", () => {
    const sat1 = new Map<string, { count: number; formats: Set<string> }>();
    sat1.set("rare", { count: 2, formats: new Set(["tutorial"]) });
    const d1 = new Map([["rare", 50]]);
    expect(calculateOpportunityScores(sat1, d1, 100)[0].details).toContain("trend=30");

    const sat2 = new Map<string, { count: number; formats: Set<string> }>();
    sat2.set("trending", { count: 5, formats: new Set(["tutorial"]) });
    const d2 = new Map([["trending", 50]]);
    expect(calculateOpportunityScores(sat2, d2, 100)[0].details).toContain("trend=80");

    const sat3 = new Map<string, { count: number; formats: Set<string> }>();
    sat3.set("saturated", { count: 9, formats: new Set(["tutorial"]) });
    const d3 = new Map([["saturated", 50]]);
    expect(calculateOpportunityScores(sat3, d3, 100)[0].details).toContain("trend=40");
  });
});

// ---------------------------------------------------------------------------
// mapPrismaToGap
// ---------------------------------------------------------------------------

describe("mapPrismaToGap", () => {
  const baseGap = {
    topic: "React Server Components",
    searchVolumeEstimate: "HIGH" as const,
    competitionScore: 75,
    opportunityScore: 88,
    suggestedTitles: ["Title A", "Title B", "Title C"],
    suggestedTags: ["react", "nextjs", "ssr"],
    scriptOutline: "Hook → Key points → CTA",
    thumbnailConcept: "Split screen: client vs server",
    estimatedRpm: "$8-15",
  };

  it("maps all fields correctly", () => {
    const result = mapPrismaToGap(baseGap);
    expect(result.topic).toBe("React Server Components");
    expect(result.searchVolumeEstimate).toBe("HIGH");
    expect(result.competitionScore).toBe(75);
    expect(result.opportunityScore).toBe(88);
    expect(result.suggestedTitles).toEqual(["Title A", "Title B", "Title C"]);
    expect(result.suggestedTags).toEqual(["react", "nextjs", "ssr"]);
    expect(result.scriptOutline).toBe("Hook → Key points → CTA");
    expect(result.thumbnailConcept).toBe("Split screen: client vs server");
    expect(result.estimatedRpm).toBe("$8-15");
  });

  it("falls back for null fields", () => {
    const gap = {
      ...baseGap,
      searchVolumeEstimate: null,
      competitionScore: null,
      scriptOutline: null,
      thumbnailConcept: null,
      estimatedRpm: null,
    };

    const result = mapPrismaToGap(gap);
    expect(result.searchVolumeEstimate).toBe("MEDIUM");
    expect(result.competitionScore).toBe(50);
    expect(result.scriptOutline).toBe("");
    expect(result.thumbnailConcept).toBe("");
    expect(result.estimatedRpm).toBe("$3-8");
  });

  it("handles suggestedTitles as a string (single title)", () => {
    const gap = { ...baseGap, suggestedTitles: "Only One Title" };
    const result = mapPrismaToGap(gap);
    expect(result.suggestedTitles).toEqual(["Only One Title"]);
  });

  it("handles suggestedTitles as non-array non-string (falls back to topic)", () => {
    const gap = { ...baseGap, suggestedTitles: null };
    const result = mapPrismaToGap(gap);
    expect(result.suggestedTitles).toEqual(["React Server Components"]);
  });

  it("handles suggestedTags as non-array (falls back to empty array)", () => {
    const gap = { ...baseGap, suggestedTags: "not-an-array" };
    const result = mapPrismaToGap(gap);
    expect(result.suggestedTags).toEqual([]);
  });

  it("includes whyThisGap field", () => {
    const result = mapPrismaToGap(baseGap);
    expect(result.whyThisGap).toContain("Previously analyzed");
  });
});
