/**
 * Demand Estimation Layer
 *
 * Multi-source demand signals for content gap analysis:
 *   1. YouTube autocomplete (free, no API key) — relative ranking, ALWAYS works
 *   2. Google Trends via Python bridge (best-effort) — historical trend direction
 *   3. YouTube Data API search counts (when quota available)
 *
 * Graceful degradation:
 *   - If Trends fails → trend direction = 0 (flat)
 *   - If autocomplete fails → fallback to keyword-based estimation
 *   - In DEVELOPMENT_MODE → simulated data
 */

import { spawn } from "child_process";
import { join } from "path";
import type { TopicDemand } from "./analytics";

// ============================================================================
// YouTube Autocomplete (free, no API key — primary demand signal)
// ============================================================================

const AUTOCOMPLETE_URL =
  "http://suggestqueries.google.com/complete/search?client=youtube&ds=yt&q=";

export interface AutocompleteResult {
  query: string;
  suggestions: string[];
  rank: number; // 0-10: position score (higher = more searched)
}

/**
 * Fetches YouTube autocomplete suggestions for a query.
 * Returns a rank score (0-10) based on suggestion presence and position.
 */
export async function fetchAutocomplete(
  query: string
): Promise<AutocompleteResult> {
  try {
    const url = AUTOCOMPLETE_URL + encodeURIComponent(query);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });
    clearTimeout(timeout);

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    // Response is JSONP: window.google.ac.h(["query", [["suggestion",0,[512]],...]])
    const text = await res.text();
    const jsonMatch = text.match(/^window\.google\.ac\.h\((.*)\);?\s*$/);
    if (!jsonMatch) throw new Error("Unexpected autocomplete response format");

    const data = JSON.parse(jsonMatch[1]) as [string, Array<string | [string, number, number[]]>];
    const rawSuggestions = data[1] ?? [];

    // Handle both old format (string[]) and new format ([string, number, number[]][])
    const suggestions = rawSuggestions.map((s) =>
      typeof s === "string" ? s : s[0]
    );

    // Rank: position-weighted score
    //   - Top suggestion exact match = +5
    //   - Top 3 suggestions containing query = +2 each
    //   - Remaining suggestions containing query = +1 each
    let rank = 0;
    for (let i = 0; i < suggestions.length; i++) {
      const s = suggestions[i].toLowerCase();
      const q = query.toLowerCase();
      if (i === 0 && s === q) {
        rank += 5; // exact top match
      } else if (i < 3 && s.includes(q)) {
        rank += 2;
      } else if (s.includes(q)) {
        rank += 1;
      }
    }
    const normalizedRank = Math.min(10, rank);

    return { query, suggestions, rank: normalizedRank };
  } catch (err) {
    console.warn(
      `[demand] Autocomplete failed for "${query}":`,
      err instanceof Error ? err.message : err
    );
    return { query, suggestions: [], rank: 0 };
  }
}

/**
 * Batch-fetches autocomplete for multiple queries sequentially.
 */
export async function batchAutocomplete(
  queries: string[]
): Promise<Map<string, number>> {
  const results = new Map<string, number>();

  for (const q of queries) {
    const { rank } = await fetchAutocomplete(q);
    results.set(q, rank);
  }

  return results;
}

// ============================================================================
// Google Trends Bridge — Python subprocess
// ============================================================================

export interface TrendsResult {
  keywords: string[];
  dataPoints: number;
  values: Record<string, number[]>;
  trendDirection: Record<string, number>; // -1 to +1
  avgInterest: Record<string, number>;    // 0-100
  error?: string;
}

/**
 * Calls the Python pytrends bridge script.
 * Best-effort — returns empty results on failure.
 *
 * @param keywordGroups - Groups of up to 5 keywords each (pytrends limit)
 * @param timeframe - e.g., "today 12-m", "today 3-m"
 */
async function callTrendsBridge(
  keywordGroups: string[][],
  timeframe: string = "today 12-m"
): Promise<TrendsResult[]> {
  const scriptPath = join(__dirname, "..", "scripts", "trends.py");

  return new Promise((resolve) => {
    const py = spawn("python3", [
      scriptPath,
      "--timeframe", timeframe,
      "--property", "youtube",
    ]);

    let stdout = "";
    let stderr = "";

    py.stdout.on("data", (d: Buffer) => { stdout += d.toString(); });
    py.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });

    py.on("close", (code: number) => {
      if (code !== 0 || !stdout.trim()) {
        console.warn(`[demand] Trends bridge failed (exit ${code}): ${stderr.slice(0, 200)}`);
        // Return empty results for all groups
        resolve(
          keywordGroups.map((keywords) => ({
            keywords,
            dataPoints: 0,
            values: Object.fromEntries(keywords.map((k) => [k, []])),
            trendDirection: Object.fromEntries(keywords.map((k) => [k, 0])),
            avgInterest: Object.fromEntries(keywords.map((k) => [k, 0])),
            error: stderr.slice(0, 200) || `exit code ${code}`,
          }))
        );
        return;
      }

      try {
        const results = JSON.parse(stdout) as TrendsResult[];
        resolve(results);
      } catch {
        resolve(
          keywordGroups.map((keywords) => ({
            keywords,
            dataPoints: 0,
            values: Object.fromEntries(keywords.map((k) => [k, []])),
            trendDirection: Object.fromEntries(keywords.map((k) => [k, 0])),
            avgInterest: Object.fromEntries(keywords.map((k) => [k, 0])),
            error: "Failed to parse bridge output",
          }))
        );
      }
    });

    // Send keyword groups as JSON on stdin
    py.stdin.write(JSON.stringify(keywordGroups));
    py.stdin.end();

    // Timeout after 30 seconds
    setTimeout(() => {
      py.kill();
      resolve(
        keywordGroups.map((keywords) => ({
          keywords,
          dataPoints: 0,
          values: Object.fromEntries(keywords.map((k) => [k, []])),
          trendDirection: Object.fromEntries(keywords.map((k) => [k, 0])),
          avgInterest: Object.fromEntries(keywords.map((k) => [k, 0])),
          error: "Bridge timed out",
        }))
      );
    }, 30000);
  });
}

// ============================================================================
// YouTube Data API — Search Result Count (quota-dependent)
// ============================================================================

export async function fetchYtSearchCount(
  refreshToken: string,
  query: string
): Promise<{ query: string; totalResults: number }> {
  const { google } = await import("googleapis");

  const oauth2Client = new google.auth.OAuth2(
    process.env.YOUTUBE_CLIENT_ID,
    process.env.YOUTUBE_CLIENT_SECRET,
    `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/callback/google`
  );
  oauth2Client.setCredentials({ refresh_token: refreshToken });

  const yt = google.youtube({ version: "v3", auth: oauth2Client });

  const res = await yt.search.list({
    part: ["id"],
    q: query,
    type: ["video"],
    maxResults: 1,
    fields: "pageInfo/totalResults",
  });

  return { query, totalResults: res.data.pageInfo?.totalResults ?? 0 };
}

// ============================================================================
// Main Demand Estimation
// ============================================================================

/**
 * Estimate demand for a list of topics using free, scalable sources.
 *
 *   1. YouTube autocomplete → rank (0-10) → maps to search interest (0-100)
 *   2. Google Trends → trend direction (-1 to +1)
 *
 * Does NOT use YouTube Data API search.list — costs 100 units/call,
 * returns unreliable totalResults, and adds no value over autocomplete.
 *
 * In DEV mode or if all sources fail → simulated data.
 */
export async function estimateDemand(
  topics: string[],
  refreshToken?: string
): Promise<Map<string, TopicDemand>> {
  // DEV mode: simulated data (unless CONTENT_GAP_REAL_DEMAND is set)
  if (process.env.DEVELOPMENT_MODE === "true" && process.env.CONTENT_GAP_REAL_DEMAND !== "true") {
    return simulateDemand(topics);
  }

  const demandMap = new Map<string, TopicDemand>();

  // Source 1: YouTube autocomplete (primary — always attempt, free)
  const autocompleteRanks = await batchAutocomplete(topics);

  // Source 2: Google Trends (best-effort for trend direction)
  // Group topics into batches of 3 to avoid rate limits
  const trendGroups: string[][] = [];
  for (let i = 0; i < topics.length; i += 3) {
    trendGroups.push(topics.slice(i, i + 3));
  }

  let trendsResults: TrendsResult[] = [];
  try {
    trendsResults = await callTrendsBridge(trendGroups, "today 12-m");
  } catch {
    // Trends failed — continue without trend direction
  }

  // Build a map of keyword → trend direction from trends results
  const trendDirectionMap = new Map<string, number>();
  for (const result of trendsResults) {
    for (const kw of result.keywords) {
      trendDirectionMap.set(kw, result.trendDirection[kw] ?? 0);
    }
  }

  // Combine signals into TopicDemand
  // Demand comes from autocomplete only — free, fast, real user intent
  for (const topic of topics) {
    const autocompleteRank = autocompleteRanks.get(topic) ?? 0;
    const trendDirection = trendDirectionMap.get(topic) ?? 0;

    let searchInterest: number;
    if (autocompleteRank > 0) {
      // From autocomplete rank: 0-10 → 0-100
      searchInterest = autocompleteRank * 10;
    } else {
      // From keyword specificity as last resort
      const specificity = topic.split(" ").length;
      searchInterest = Math.min(80, Math.max(20, 60 - specificity * 5));
    }

    demandMap.set(topic, {
      topic,
      searchInterest,
      trendDirection,
      autocompleteRank,
    });
  }

  return demandMap;
}

// ============================================================================
// DEV Mode — Simulated Demand
// ============================================================================

function simulateDemand(topics: string[]): Map<string, TopicDemand> {
  const demandMap = new Map<string, TopicDemand>();

  for (const topic of topics) {
    const wordCount = topic.split(" ").length;
    const hasNumbers = /\d/.test(topic);

    const baseInterest = 60 + (hasNumbers ? 10 : 0);
    const specificityPenalty = (wordCount - 1) * 5;
    let searchInterest = Math.round(baseInterest - specificityPenalty);

    searchInterest += Math.floor(Math.random() * 20) - 10;
    searchInterest = Math.min(100, Math.max(10, searchInterest));

    const autocompleteRank = Math.min(10, Math.floor(searchInterest / 10));
    const trendDirection = Math.round((Math.random() * 0.8 - 0.3) * 100) / 100;

    demandMap.set(topic, {
      topic,
      searchInterest,
      trendDirection,
      autocompleteRank,
    });
  }

  return demandMap;
}
