# Content Gap Analyzer — Professional Methodology

> **Status:** Research Complete — Implementation-Ready
> **Last updated:** April 28, 2026
> **Source:** VISION.md §6.1.1 + industry best practices (Subscribr, OutlierKit, TubeBuddy, Jesús Paz, Google Trends)

---

## The AI Boundary — Critical Principle

**Math decides. AI writes.**

The analysis engine is a calculator, not a chatbot. Every decision about WHAT is a gap, HOW good it is, and HOW it ranks is pure deterministic computation: formulas, statistics, and API responses. 100% reproducible. 100% testable. Same input → same output every time.

An LLM is used for exactly two things:

| Role | Task | Why |
|------|------|-----|
| **Classifier** | Group video titles into topics and formats | Needs semantic understanding of language |
| **Writer** | Generate human-readable titles, tags, and explanations | Creative copywriting from structured data |

The LLM never touches a score. It receives already-computed scores as input and phrases them — it does not calculate, weigh, rank, or decide anything.

If the LLM misclassifies a few titles into the wrong topic, the math still runs correctly on whatever groups it received. The scoring formulas don't care where the grouping came from — they just count, average, and rank.

For 100% determinism in classification, a TF-IDF + cosine similarity fallback is specified below. It's less accurate at understanding semantic meaning (e.g., "I tried X" vs. "X review" might land in different clusters), but it's fully deterministic.

---

## Table of Contents

1. [Core Philosophy](#1-core-philosophy)
2. [The Full Analysis Pipeline](#2-the-full-analysis-pipeline)
3. [Scoring Algorithms](#3-scoring-algorithms)
4. [Data Sources & APIs](#4-data-sources--apis)
5. [YouTube API Quota Strategy](#5-youtube-api-quota-strategy)
6. [RPM/CPM Reference Data](#6-rpmcpm-reference-data)
7. [Output Specification](#7-output-specification)
8. [Implementation Architecture](#8-implementation-architecture)
9. [Appendix: Research Sources](#9-appendix-research-sources)

---

## 1. Core Philosophy

### The Demand-Supply Arbitrage Principle

> A **content gap** exists when there is significant audience demand for a topic, format, or angle, but the available supply of videos addressing it is insufficient, low-quality, or nonexistent.

**Origins:** Bryan Ng's "Demand Supply Arbitrage" — don't fight for saturated keywords. Find the pockets where viewers are searching but few creators are delivering.

**Why this beats SEO competition:** Trying to out-rank 50 established channels on "how to lose weight" is a losing game. Finding "keto meal prep for truck drivers" (high demand, near-zero supply) is a winning strategy.

### What Makes a Gap Actionable

A content gap is ONLY useful if all three conditions are met:

| Condition | Metric | Threshold |
|-----------|--------|-----------|
| **Real demand** | Search volume / trend signal | Above noise floor |
| **Low supply** | Videos targeting this topic | < 20 quality results |
| **Creatable** | Difficulty estimate aligned with user capability | Within user's production capacity |

---

## 2. The Full Analysis Pipeline

The analysis runs in **6 phases**. Four are fully deterministic (D), one is LLM-assisted for grouping only (L), one uses LLM only for creative output after all scoring is done (L).

```
PHASE 1        PHASE 2         PHASE 3          PHASE 4         PHASE 5        PHASE 6
Channel        Video           Content          Search          Gap             Output
Discovery  →   Harvesting  →   Classification → Trend       →   Scoring    →   Generation
[D]             [D]             [L] group-only   [D]             [D]             [L] write-only
```

Quota consumption per analysis: ~800-1,200 units (~10% of daily 10,000).

### Phase 1: Channel Discovery `[DETERMINISTIC]`

**Goal:** Find the top 50-100 channels in the target niche.

**Method:**
1. User provides niche keyword(s) — e.g., "personal finance for beginners"
2. Generate 5-10 search query variants:
   - Broad: "personal finance"
   - Long-tail: "how to budget for beginners"
   - Format-specific: "personal finance tutorial"
   - Trending: "personal finance 2025"
3. For each query, call `search.list` (type=video, order=viewCount, maxResults=50)
   - Collect unique channel IDs from results
   - Deduplicate across queries
4. Call `channels.list` on all collected channel IDs (batch of 50, cost: 1 unit)
   - Filter by: subscriber count, video count, relevance
   - Sort by: subscriber count descending
   - Take top 50-100

**API Cost:** ~500-1000 units (5-10 searches × 100 units each)

**Optimization:** Cache channel discovery results per niche for 24 hours in Redis.

### Phase 2: Video Harvesting `[DETERMINISTIC]`

**Goal:** Collect recent videos (last 90 days) from each discovered channel.

**Method:**
1. For each channel, get the uploads playlist ID from `channels.list` (already fetched in Phase 1)
2. Call `playlistItems.list` on each channel's uploads playlist
   - `maxResults=50`, fetch 2-3 pages per channel (100-150 recent videos)
   - Collect: video ID, title, publishedAt
3. Batch all collected video IDs into groups of 50
4. Call `videos.list` (batch of 50, cost: 1 unit per batch)
   - Request parts: `snippet,statistics,contentDetails`
   - Collect: title, description, tags, categoryId, duration, viewCount, likeCount, commentCount, publishedAt

**API Cost:** ~100-200 units
- 50 channels × 3 playlistItem pages = 150 units
- ~2000 videos / 50 per batch = 40 units for videos.list

### Phase 3: Content Classification & Tag Analysis `[LLM-ASSISTED — grouping only]`

**Goal:** Group videos into topics and formats so the deterministic scoring pipeline can count, average, and rank them.

**What the LLM does here:** Read a video title → output a topic label and format label. That's it. This is a classification task, not analysis.

**What happens next:** The deterministic pipeline (Phase 5) takes these groupings and runs math on them — counting videos per topic, averaging views, computing ratios. The LLM has zero involvement in scoring.

**Method:**

**A. Primary: LLM-based classification**

1. **Topic extraction:** Feed batches of 50 video titles + tags to LLM → output structured topic labels
   - Example: "5 Best Credit Cards for Students 2025" → topic: "student credit cards"
   - Structured output via Zod schema — the LLM returns JSON, never free text
   - Temperature: 0.3 (low creativity, high consistency)

2. **Format classification:** LLM classifies each video into an enumerated set:
   - Tutorial / How-to
   - Review / Comparison
   - Listicle / Ranking
   - Vlog / Personal story
   - Explainer / Educational
   - Challenge / Experiment
   - Reaction / Commentary
   - News / Trend coverage

**B. Fallback: Deterministic TF-IDF clustering (no AI)**

If you want zero AI in the pipeline, or if the LLM is unavailable:

1. Tokenize all video titles (lowercase, remove stopwords)
2. Build TF-IDF vectors per title
3. Compute cosine similarity between all title pairs
4. Cluster using threshold-based grouping (titles with similarity > 0.4 share a topic)
5. Assign topic name from most frequent n-gram in cluster
6. Format classification via regex keyword matching:
   - `/(how to|tutorial|guide|learn|beginner)/i` → tutorial
   - `/(review|vs|comparison|best|worst|honest)/i` → review
   - `/(top \d+|ranking|tier list)/i` → listicle
   - etc.

This is less accurate at catching semantic relationships (e.g., "I tried X for 30 days" won't automatically map to "review" unless keywords match), but it's 100% deterministic and reproducible.

**After classification (either method) — deterministic tag analysis:**

3. **Tag frequency analysis:** Aggregate all tags across videos → rank by frequency
   - High-frequency tags = saturated areas
   - Low-frequency tags on high-view videos = potential gaps
   - This is pure counting — no AI involved

4. **Saturation mapping:** For each topic cluster (deterministic math):
   - Count: number of videos, number of channels covering it
   - Average/median views per video
   - Recency: how many videos in last 30 days

### Phase 4: Search Trend Analysis `[DETERMINISTIC]`

**Goal:** Quantify demand for each identified topic.

**Method (two-pronged):**

**A. Google Trends API (official alpha — apply for access)**
- Query each topic keyword with `category=YouTube Search`
- Get interest-over-time for last 90 days + last 12 months
- Consistent scaling across requests (unlike the Trends website's 0-100)
- Detect: rising trends, seasonal patterns, declining interest

**B. pytrends (fallback, unofficial)**
- `pip install pytrends`
- Same queries, but rate-limited and less reliable
- Use as fallback if Google Trends API alpha not yet approved

**C. YouTube Autocomplete (free, no API key)**
- Query YouTube's suggest endpoint for each topic
- Longer autocomplete suggestions = higher search volume
- Use as supplementary demand signal

**Trend Scoring:**
| Signal | Weight | How to Compute |
|--------|--------|----------------|
| Search interest (90d) | 35% | Google Trends 0-100 normalized |
| Trend direction | 20% | Slope of 90-day trend line (rising = bonus, declining = penalty) |
| Seasonality | 10% | 12-month pattern detection |
| Autocomplete rank | 15% | Position in YT autocomplete for topic |
| Related queries growth | 20% | Are associated searches growing? |

### Phase 5: Gap Scoring `[DETERMINISTIC]`

**Goal:** For each potential topic, compute an Opportunity Score (0-100) using pure math. No AI involved — these are formulas applied to the data from Phases 1-4.

#### 5.1 The Core Formula

```
OPPORTUNITY_SCORE = (DEMAND_SCORE × DEMAND_WEIGHT) + (SUPPLY_GAP_SCORE × SUPPLY_WEIGHT) + (COMPETITION_QUALITY_SCORE × QUALITY_WEIGHT) + (FORMAT_DIVERSITY_SCORE × FORMAT_WEIGHT) + (TREND_SCORE × TREND_WEIGHT)
```

#### 5.2 Component Definitions

**DEMAND_SCORE (0-100)**
Measures how many people are searching for this topic.

| Input | Transformation |
|-------|---------------|
| Google Trends interest (0-100) | Direct mapping |
| YouTube autocomplete presence | +10 if appears, +20 if top-3 |
| Related query count | log scale, normalized 0-100 |
| Comments requesting this topic | Bonus +5-15 (from Phase 3 audience mining) |

**SUPPLY_GAP_SCORE (0-100) — inverted**
Fewer quality videos = higher score. This is the core of gap analysis.

```
supply_ratio = video_count_on_topic / sqrt(search_interest + 1)
SUPPLY_GAP_SCORE = 100 - (supply_ratio × 100 / max_supply_ratio_in_niche)
```

Clamped to 0-100. A topic with 3 videos and high search interest gets ~90. A topic with 200 videos and low interest gets ~10.

**COMPETITION_QUALITY_SCORE (0-100) — inverted**
It's better if existing videos on this topic are LOW quality or from SMALL channels.

```
avg_competitor_authority = mean(competitor_subscriber_count) / 100000  # normalized
avg_competitor_views = mean(views_per_video_on_topic)
content_freshness = fraction_of_videos_newer_than_90_days

quality_raw = (0.4 × avg_competitor_authority) + (0.4 × avg_competitor_views_score) + (0.2 × content_freshness)
COMPETITION_QUALITY_SCORE = 100 - (quality_raw × 100)  # inverted
```

**FORMAT_DIVERSITY_SCORE (0-100)**
Rewards topics where certain formats are underserved.

```
For each format in [tutorial, review, listicle, vlog, explainer, challenge]:
    format_saturation = videos_in_format / total_videos_on_topic

# Identify least-served formats with high demand
FORMAT_DIVERSITY_SCORE = 100 - (most_saturated_format_ratio × 100)
```

Plus bonus: +20 if 2+ formats have zero videos on this topic.

**TREND_SCORE (0-100)**
Is interest in this topic growing or shrinking?

```
trend_slope = linear_regression_slope(search_interest, last_90_days)
trend_acceleration = second_derivative  # is growth speeding up?

TREND_SCORE = 50 + (trend_slope × 50) + (trend_acceleration × 25)
# Clamp to 0-100
```

#### 5.3 Weights (Tunable)

| Component | Weight | Rationale |
|-----------|--------|-----------|
| DEMAND_SCORE | 30% | Need real interest |
| SUPPLY_GAP_SCORE | 30% | Core gap signal |
| COMPETITION_QUALITY_SCORE | 15% | Can you beat existing content? |
| FORMAT_DIVERSITY_SCORE | 10% | Format-level opportunities |
| TREND_SCORE | 15% | Timing matters |

### Phase 6: Output Generation `[LLM-ASSISTED — writing only]`

**Goal:** Transform the already-ranked gaps into human-readable video ideas. The LLM receives computed scores as input — it does not calculate or decide anything.

**What the LLM does here:** Creative copywriting from structured data. It takes a topic + its computed scores + niche context → outputs titles, tags, and rationale.

**What was already decided (by Phase 5, deterministically):** Which topics are gaps, what their scores are, how they rank. The LLM simply wraps these in language.

For each gap in the top 15-25 (sorted by Opportunity Score descending):

1. **Generate suggested titles (3 variants):**
   - SEO-optimized (keyword-first, under 60 chars)
   - Curiosity-driven (pattern-interrupt, higher CTR)
   - Hybrid (keyword + curiosity)
   - Respect best practices: keyword in first 50 chars, under 60 total, no clickbait

2. **Generate recommended tags (8-12):**
   - 2-3 broad niche tags
   - 4-6 specific topic tags
   - 2-3 long-tail tags
   - Based on high-performing tag patterns from Phase 3

3. **Estimate competition level:**
   - Low: < 5 quality videos on topic
   - Medium: 5-20 quality videos
   - High: 20+ quality videos
   - Based on SUPPLY_GAP_SCORE and COMPETITION_QUALITY_SCORE

4. **Estimate difficulty (1-5):**
   - 1: Simple talking-head, no research needed
   - 2: Basic research + simple editing
   - 3: Moderate research, some B-roll/graphics
   - 4: Extensive research, multiple sources, heavy editing
   - 5: Original investigation, data analysis, high production value

5. **Estimate potential RPM:**
   - Based on niche RPM reference data (see §6)
   - Adjusted by: format type, estimated video length, audience geography

6. **"Why this gap" explanation:**
   - 2-3 sentence rationale citing data
   - Example: "Only 4 videos cover this topic, yet Google Trends shows 85/100 interest and rising. The existing videos average 2.3K views from channels under 5K subscribers — low authority competition you can outperform."

---

## 3. Scoring Algorithms

### 3.1 Topic Saturation Index

Quantifies how "crowded" a topic is:

```
SATURATION_INDEX = (video_count × avg_views × channel_authority_factor) / search_interest

Where:
  channel_authority_factor = log10(avg_subscriber_count_of_creators) / 5
```

| Saturation Index | Label | Meaning |
|-----------------|-------|---------|
| 0 - 2.0 | Low saturation | Green zone — attack |
| 2.0 - 5.0 | Medium saturation | Yellow — differentiate |
| 5.0 - 10.0 | High saturation | Orange — niche down further |
| 10.0+ | Over-saturated | Red — avoid unless unique angle |

### 3.2 Outlier Detection

Identify videos that dramatically outperform their channel's average — these reveal high-demand topics.

```
VIEW_RATIO = video_views / channel_average_views_last_90_days

OUTLIER_THRESHOLD = 3.0  # 3x channel average
STRONG_OUTLIER = 10.0    # 10x channel average
```

An outlier video on a topic with low overall coverage is a **double-confirmed gap** — the algorithm already proved it works.

### 3.3 Channel Authority Score

Normalize competitor strength for fair comparison:

```
AUTHORITY_SCORE = (0.4 × log10(subscribers)) + (0.3 × log10(total_views)) + (0.3 × engagement_rate)

engagement_rate = (avg_likes + avg_comments) / avg_views
```

---

## 4. Data Sources & APIs

### 4.1 YouTube Data API v3

| Endpoint | Cost | Batch Size | Use |
|----------|------|------------|-----|
| `search.list` | 100 units | 50 results | Phase 1: Channel discovery |
| `channels.list` | 1 unit | 50 channels | Phase 1: Channel stats |
| `playlistItems.list` | 1 unit | 50 items | Phase 2: Get channel videos |
| `videos.list` | 1 unit | 50 videos | Phase 2: Video details + stats |
| `commentThreads.list` | 1 unit | 100 comments | Phase 3: Audience mining (optional) |

**Authentication:** API Key (public data only) — no OAuth needed unless accessing user's private analytics.

**Quota:** 10,000 units/day/project. Resets midnight Pacific Time.

### 4.2 Google Trends API (Official Alpha — July 2025)

**Status:** Alpha — apply at https://developers.google.com/search/apis/trends#apply

**Key features:**
- Consistent scaling across requests (can join data from multiple calls)
- YouTube Search filter available
- 1,800-day (~5 year) rolling window
- Daily/weekly/monthly/yearly aggregation
- Compare dozens of terms simultaneously

**Fallback:** `pytrends` Python library (unofficial, rate-limited)

### 4.3 YouTube Autocomplete (Free)

**Endpoint:** `http://suggestqueries.google.com/complete/search?client=youtube&ds=yt&q=QUERY`

Returns up to 10 autocomplete suggestions. Longer suggestions = higher search volume.
Use as supplementary demand signal, not primary.

### 4.4 LLM (DeepSeek / OpenAI / Claude)

**Principle:** LLM is a language tool, not an analysis tool. It is used ONLY for tasks that require understanding or generating natural language.

**Uses (language tasks only):**

| Task | Phase | Input | Output | Deterministic? |
|------|-------|-------|--------|----------------|
| Topic classification | Phase 3 | Video titles + tags (text) | Topic label (enum) | Semi — structured JSON output, but grouping is semantic |
| Format classification | Phase 3 | Video title (text) | Format label (enum) | Strongly constrained — 8-category enum, Zod-validated |
| Title generation | Phase 6 | Topic + scores (numbers) | 3 title variants (text) | Creative — user selects what to use |
| Tag generation | Phase 6 | Topic + niche (text) | 8-12 tags (text) | Creative — suggestions only |
| "Why this gap" explanation | Phase 6 | Topic + all 5 scores (numbers) | 2-3 sentence rationale (text) | Phrasing only — the numbers are facts, the LLM just words them |

**What the LLM NEVER does:**
- Calculate any score
- Compare or rank gaps
- Decide if something is a gap
- Estimate search volume or RPM
- Perform any arithmetic

**Cost:** Minimal — ~10-20 LLM calls per analysis run. Classification calls use low temperature (0.3). Generation calls use higher temperature (0.8) for creative variety.

---

## 5. YouTube API Quota Strategy

### 5.1 Per-Analysis Budget

| Phase | Operation | Calls | Cost/Unit | Total |
|-------|-----------|-------|-----------|-------|
| 1 | search.list (5-10 queries) | 8 | 100 | 800 |
| 1 | channels.list (batch 50) | 2 | 1 | 2 |
| 2 | playlistItems.list (50 ch × 3 pages) | 150 | 1 | 150 |
| 2 | videos.list (batch 50, ~2000 vids) | 40 | 1 | 40 |
| 3 | (LLM, no API cost) | — | — | 0 |
| 4 | Google Trends (separate API) | — | — | 0 |
| 5 | (computation only) | — | — | 0 |
| 6 | (LLM, no API cost) | — | — | 0 |
| **TOTAL** | | | | **~992 units** |

**This is ~10% of daily quota.** Allows for 8-10 analyses per day per API key.

### 5.2 Critical Optimizations

1. **NEVER use `search.list` when you already have IDs.** Use `videos.list` with batched IDs (1 unit per 50).

2. **Batch everything.** 50 channel IDs, 50 video IDs, 50 playlist items — max out every call.

3. **Request only needed `part` parameters.** `videos.list` with `part=statistics` is lighter than `part=snippet,statistics,contentDetails,status`.

4. **Use `fields` parameter** to minimize response payload:
   ```
   fields=items(id,statistics(viewCount,likeCount,commentCount))
   ```

5. **Aggressive Redis caching:**
   - Channel details: TTL 24 hours
   - Video stats: TTL 6 hours (can be 12 for historical analysis)
   - Search results: TTL 24 hours
   - Google Trends data: TTL 12 hours

6. **Stagger analyses:** If multiple users trigger analysis simultaneously, queue them (BullMQ) with 30-second spacing to avoid rate limits.

### 5.3 Scaling Beyond 10,000 Units

Options if needed:
- Multiple GCP projects (each gets 10,000 units) — gray area, use responsibly
- Apply for quota increase via https://support.google.com/youtube/contact/yt_api_form (requires compliance audit)
- Consider ContentStats API (paid, no quota limits) as fallback

---

## 6. RPM/CPM Reference Data

### 6.1 Niche RPM Table (Verified Q1 2026)

Used for estimating potential RPM in output.

| Niche Category | Avg RPM | Avg CPM | Competition |
|---------------|---------|---------|-------------|
| Personal Finance & Investing | $8.00 | $15-30 | Very High |
| Business & Entrepreneurship | $6.50 | $10-25 | High |
| Legal / Law | $7.00 | $12-22 | Medium |
| Real Estate | $6.00 | $10-18 | Medium |
| Tech Reviews / Gadgets | $5.50 | $8-20 | High |
| Software Development | $5.00 | $8-15 | Medium |
| AI & Machine Learning | $5.50 | $8-18 | High |
| Health & Fitness | $5.00 | $8-15 | High |
| Digital Marketing | $5.00 | $8-16 | High |
| Education & Online Learning | $4.50 | $6-12 | Medium |
| Travel | $4.00 | $6-12 | Medium-High |
| Lifestyle & Vlogging | $3.50 | $5-10 | Very High |
| Cooking & Food | $3.00 | $4-8 | Medium |
| Gaming | $2.50 | $2-5 | Very High |
| Entertainment | $2.00 | $2-5 | Extreme |
| Music | $1.50 | $2-4 | Extreme |
| Motivational / Self-Improvement | $4.00 | $6-10 | High |
| Science & Education | $4.50 | $6-12 | Low-Medium |
| ASMR / Sleep / Wellness | $5.00 | $8-16 | Medium |

**Formula:** `estimated_rpm = base_rpm × audience_geo_factor × format_factor`

### 6.2 RPM Adjustment Factors

**Audience Geography Factor:**
- 60%+ US/Canada/Australia views: ×1.3
- 40-60% tier-1: ×1.0
- < 40% tier-1: ×0.7

**Format Factor:**
- 8+ minute video (mid-roll ads): ×1.2
- 3-8 minute video: ×1.0
- < 3 minute video: ×0.7

---

## 7. Output Specification

### 7.1 Return Format

The analysis returns an array of `ContentGap` objects, sorted by `opportunityScore` descending.

```typescript
interface ContentGap {
  id: string;
  topic: string;                    // e.g., "budgeting for freelancers"
  subtopic?: string;                // e.g., "quarterly tax planning"
  
  // Scores
  opportunityScore: number;         // 0-100, primary sort key
  demandScore: number;              // 0-100
  supplyGapScore: number;           // 0-100 (higher = fewer videos)
  competitionQualityScore: number;  // 0-100 (higher = easier to beat)
  formatDiversityScore: number;     // 0-100
  trendScore: number;               // 0-100
  
  // Quantified metrics
  estimatedSearchVolume: number;    // 0-100 (relative)
  competingVideos: number;          // count of videos on this topic
  saturationIndex: number;          // computed index
  
  // Generated content
  suggestedTitles: string[];        // 3 variants
  recommendedTags: string[];        // 8-12 tags
  estimatedDifficulty: number;      // 1-5
  estimatedRPM: number;             // in dollars
  whyThisGap: string;               // 2-3 sentence rationale
  
  // Source data
  topPerformingVideos: string[];    // 3-5 video IDs that prove demand
  outlierVideos: string[];          // video IDs that 10x'd on this topic
  competitorChannels: string[];     // channels covering this topic
}
```

### 7.2 User-Facing Display

The UI should display gaps grouped by:

1. **"Gold Mine"** (opportunityScore 80-100): Low competition, high demand — act fast
2. **"Strong Opportunity"** (60-79): Good gaps, some competition
3. **"Worth Exploring"** (40-59): Decent gaps, need differentiation
4. **"High Competition"** (0-39): Saturated — only if you have a unique angle

---

## 8. Implementation Architecture

### 8.1 Processing Model: Background Job (BullMQ)

Content gap analysis is computationally intensive (API calls + LLM processing). It MUST be a background job, not a synchronous API route.

```
User clicks "Analyze Niche"
       │
       ▼
API Route: POST /api/analyze/gap
  - Validates niche input
  - Creates ContentGapAnalysis record (status: "queued")
  - Enqueues BullMQ job
  - Returns { analysisId, status: "queued" }
       │
       ▼
BullMQ Worker: content-gap-analyzer
  - Phase 1-6 processing
  - Progressive status updates (status: "discovering_channels" → "analyzing_videos" → ...)
  - Stores results in ContentGap table
  - Sets analysis status to "completed"
       │
       ▼
Frontend polls GET /api/analyze/gap/:id/status
  - Shows progress bar with phase name
  - On "completed", fetches results
```

### 8.2 Database Schema

```prisma
model ContentGapAnalysis {
  id        String   @id @default(cuid())
  userId    String
  niche     String
  status    String   // "queued" | "discovering_channels" | "harvesting_videos" | "classifying_content" | "analyzing_trends" | "scoring_gaps" | "generating_output" | "completed" | "failed"
  progress  Int      @default(0)  // 0-100
  error     String?
  channelsAnalyzed  Int?
  videosAnalyzed    Int?
  topicsIdentified  Int?
  gapsGenerated     Int?
  metadata  Json?    // niche keywords, filters used
  createdAt DateTime @default(now())
  completedAt DateTime?
  
  gaps      ContentGap[]
}

model ContentGap {
  id              String   @id @default(cuid())
  analysisId      String
  analysis        ContentGapAnalysis @relation(fields: [analysisId], references: [id])
  
  topic           String
  subtopic        String?
  
  opportunityScore        Float
  demandScore             Float
  supplyGapScore          Float
  competitionQualityScore Float
  formatDiversityScore    Float
  trendScore              Float
  
  estimatedSearchVolume   Float
  competingVideos         Int
  saturationIndex         Float
  
  suggestedTitles         Json     // string[]
  recommendedTags         Json     // string[]
  estimatedDifficulty     Int
  estimatedRPM            Float
  whyThisGap              String
  
  topPerformingVideoIds   Json?    // string[]
  outlierVideoIds         Json?    // string[]
  competitorChannelIds    Json?    // string[]
  
  createdAt DateTime @default(now())
}
```

### 8.3 Key Configuration

```env
# YouTube Data API
YOUTUBE_API_KEY=xxx
YOUTUBE_API_QUOTA_LIMIT=10000

# Google Trends API (alpha)
GOOGLE_TRENDS_API_KEY=xxx

# Analysis defaults
CONTENT_GAP_MAX_CHANNELS=100
CONTENT_GAP_MAX_VIDEOS_PER_CHANNEL=150
CONTENT_GAP_VIDEO_LOOKBACK_DAYS=90
CONTENT_GAP_MAX_GAPS_OUTPUT=25

# Redis cache TTLs (seconds)
CACHE_CHANNEL_TTL=86400       # 24 hours
CACHE_VIDEO_STATS_TTL=21600   # 6 hours
CACHE_SEARCH_TTL=86400        # 24 hours
CACHE_TRENDS_TTL=43200        # 12 hours
```

---

## 9. Appendix: Research Sources

| Source | Key Insight |
|--------|-------------|
| Subscribr.ai — Content Gap Analysis guide | 5-step framework, Demand-Supply Arbitrage principle |
| Jesús Paz — YouTube Competitor Analysis (Python) | Views-to-subscribers ratio, Python API patterns |
| OutlierKit — Niche + RPM guides | 3-circle framework, verified RPM data by niche |
| TubeBuddy KANDO Method | 5-point decision framework for video ideas |
| YouTube Data API v3 — Official docs | Quota costs, batching, optimization |
| Google Trends API alpha (July 2025) | New official API, consistent scaling |
| dev.to — "Track 100K Videos Without Hitting Quota" | Batching strategy, caching patterns |
| KDCC Blog — Free YouTube Keyword Tools | Google Trends YouTube filter, YT Studio Trends tab |
| Elfsight — YouTube API Complete Guide | Full quota table, pagination costs |

---

> **Next Steps:** This methodology is implementation-ready. The worker code should be built as a TypeScript module in `apps/workers/src/analyzers/content-gap-analyzer.ts`, structured as the 6-phase pipeline above, with each phase as a separate function for testability.
