# CreatorForge — Phase 1 Build Plan

> **This is the execution guide.** VISION.md is the *what* and *why*. This document is the *how* and *when*.
> Each step is a shippable checkpoint. Don't move to the next step until the current one is demonstrable.
>
> **Last updated:** April 28, 2026
> **Status:** Step 2 — Content Gap Analyzer: Core complete, scoring refined, real demand enabled
> **Target completion:** 8 weeks (solo developer, realistic pace)

---

## Table of Contents

1. [Build Philosophy](#1-build-philosophy)
2. [Step 0 — Project Scaffold & Foundations](#2-step-0--project-scaffold--foundations)
3. [Step 1 — YouTube API Integration](#3-step-1--youtube-api-integration)
4. [Step 2 — Content Gap Analyzer](#4-step-2--content-gap-analyzer)
5. [Step 3 — A/B Test Manager & Thumbnail Generator](#5-step-3--ab-test-manager--thumbnail-generator)
6. [Step 4 — Analytics Dashboard & Onboarding](#6-step-4--analytics-dashboard--onboarding)
7. [Step 5 — Polish, Landing Page, Launch](#7-step-5--polish-landing-page-launch)
8. [What We Are NOT Building (Phase 1)](#8-what-we-are-not-building-phase-1)
9. [Decision Log](#9-decision-log)

---

## 1. Build Philosophy

**Ship something testable every ~2 weeks.** Never disappear for 6 weeks and "hope it works." Each step ends with a feature a real creator can use and react to.

**Vertical slices, not horizontal layers.** Don't build "the database layer" then "the API layer" then "the UI layer." Build "the content gap analyzer" end-to-end, including its database tables, API routes, background jobs, and UI. Then move to the next feature.

**Real creators from day one.** Find 3-5 YouTube creators willing to try the product and give feedback. Show them every checkpoint. Their reactions will save you months of building the wrong thing.

**The website is last.** You don't need a marketing site to test whether the product works. The product IS the pitch. Build the landing page only when you have something to sell.

---

## 2. Step 0 — Project Scaffold & Foundations

**Goal:** A running Next.js app with auth, database, and Redis. Zero business logic yet. This is the skeleton.

**Time:** 2-3 days

### 2.1 Create the project

```bash
npx create-next-app@latest creatorforge \
  --typescript \
  --tailwind \
  --eslint \
  --app \
  --src-dir \
  --import-alias "@/*"

cd creatorforge
```

### 2.2 Install core dependencies

```bash
# Styling & UI
npx shadcn@latest init
npx shadcn@latest add button card input label select separator tabs toast dialog dropdown-menu avatar

# Database
npm install prisma @prisma/client
npx prisma init

# Auth
npm install next-auth@beta @auth/prisma-adapter

# Redis & Queue
npm install ioredis bullmq

# Charts (add one — Tremor recommended for clean look)
npm install @tremor/react

# YouTube API
npm install googleapis

# Utilities
npm install zod date-fns
```

### 2.3 Set up infrastructure accounts

| Service | What to do | Cost |
|---------|-----------|------|
| **Supabase** (PostgreSQL) | Create project, get connection string | $0 (free tier) |
| **Upstash** (Redis) | Create Redis database, get connection string | $0 (free tier) |
| **Google Cloud Console** | Create project, enable YouTube Data API v3, create OAuth 2.0 credentials | $0 |
| **OpenAI** | Create account, generate API key | $0 (pay-per-use, set $10 limit) |
| **Cloudflare R2** | Create bucket for thumbnail storage | $0 (free tier: 10GB) |
| **Resend** | Create account, verify domain for emails | $0 (free tier: 100/day) |

### 2.4 Configure environment variables

Create `.env.local`:

```env
# Database
DATABASE_URL="postgresql://..."

# Auth
AUTH_SECRET="generate-with-openssl-rand-base64-32"
AUTH_GOOGLE_ID="..."
AUTH_GOOGLE_SECRET="..."

# YouTube API
YOUTUBE_API_KEY="..."
YOUTUBE_CLIENT_ID="..."
YOUTUBE_CLIENT_SECRET="..."

# Redis
REDIS_URL="redis://..."

# OpenAI
OPENAI_API_KEY="sk-..."

# Storage
R2_ACCOUNT_ID="..."
R2_ACCESS_KEY_ID="..."
R2_SECRET_ACCESS_KEY="..."
R2_BUCKET_NAME="creatorforge-thumbnails"

# App
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

### 2.5 Set up Prisma schema (initial)

```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id            String    @id @default(cuid())
  email         String    @unique
  name          String?
  avatar        String?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  // Relationships (added in later steps)
  channels      Channel[]
  competitors   Competitor[]
  thumbnailTests ThumbnailTest[]
  contentGaps   ContentGap[]

  // Auth
  accounts      Account[]
  sessions      Session[]
}

// NextAuth models (standard)
model Account {
  id                String  @id @default(cuid())
  userId            String
  type              String
  provider          String
  providerAccountId String
  refresh_token     String? // Encrypted Google refresh token
  access_token      String?
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String?
  session_state     String?

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
}

model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       String
  expires      DateTime
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

// Placeholder models — fleshed out in later steps
model Channel {
  id               String   @id @default(cuid())
  userId           String
  youtubeChannelId String   @unique
  channelName      String
  subscriberCount  Int      @default(0)
  totalViews       Int      @default(0)
  totalVideos      Int      @default(0)
  nicheCategory    String?
  brandColors      Json     @default("[]")
  brandFont        String?
  faceReferenceUrl String?
  statsUpdatedAt   DateTime @default(now())
  createdAt        DateTime @default(now())

  user   User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  videos Video[]
}

model Video {
  id              String   @id @default(cuid())
  channelId       String
  youtubeVideoId  String   @unique
  title           String
  thumbnailUrl    String?
  publishedAt     DateTime
  views           Int      @default(0)
  likes           Int      @default(0)
  comments        Int      @default(0)
  ctr             Float?
  avgRetention    Float?
  tags            Json     @default("[]")
  category        String?
  durationSeconds Int?
  seoScore        Int?
  createdAt       DateTime @default(now())

  channel Channel @relation(fields: [channelId], references: [id], onDelete: Cascade)
}

model Competitor {
  id                String   @id @default(cuid())
  userId            String
  youtubeChannelId  String
  channelName       String
  subscriberCount   Int      @default(0)
  nicheOverlapScore Int?
  addedAt           DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model ThumbnailTest {
  id             String    @id @default(cuid())
  videoId        String
  userId         String
  variantAUrl    String
  variantBUrl    String
  variantCUrl    String?
  testStartedAt  DateTime?
  testEndedAt    DateTime?
  winnerVariant  String?
  confidenceLevel Float?
  ctrA           Float?
  ctrB           Float?
  ctrC           Float?
  createdAt      DateTime  @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model ContentGap {
  id                String   @id @default(cuid())
  userId            String
  niche             String
  topic             String
  searchVolumeEstimate String?
  competitionScore  Int?
  suggestedTitle    String?
  suggestedTags     Json     @default("[]")
  opportunityScore  Int      @default(0)
  generatedAt       DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```

### 2.6 Set up NextAuth with Google OAuth

Create `src/auth.ts`:

```typescript
import NextAuth from "next-auth"
import Google from "next-auth/providers/google"
import { PrismaAdapter } from "@auth/prisma-adapter"
import { prisma } from "@/lib/prisma"

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID!,
      clientSecret: process.env.AUTH_GOOGLE_SECRET!,
      authorization: {
        params: {
          scope: "openid email profile https://www.googleapis.com/auth/yt-analytics.readonly https://www.googleapis.com/auth/youtube.readonly",
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
  ],
  callbacks: {
    async session({ session, user }) {
      session.user.id = user.id
      return session
    },
  },
})
```

Create `src/lib/prisma.ts`:

```typescript
import { PrismaClient } from "@prisma/client"

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma = globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma
```

### 2.7 Set up Redis client

Create `src/lib/redis.ts`:

```typescript
import Redis from "ioredis"

const globalForRedis = globalThis as unknown as {
  redis: Redis | undefined
}

export const redis = globalForRedis.redis ?? new Redis(process.env.REDIS_URL!)

if (process.env.NODE_ENV !== "production") globalForRedis.redis = redis
```

### 2.8 Create the basic layout

Build a minimal app shell with:
- A top nav bar (logo, user avatar, sign out)
- A sidebar (placeholder links for dashboard, strategy, thumbnails, analytics, settings)
- Protected routes (middleware redirects unauthenticated users to sign-in)
- A `/dashboard` page that says "Connect your YouTube channel" (placeholder)

### 2.9 Step 0 Checkpoint

- [ ] `npm run dev` — app starts without errors
- [ ] Google OAuth sign-in works (no YouTube scopes yet — just email/profile)
- [ ] Database migrated and running
- [ ] Redis connection verified
- [ ] Protected routes work (unauthenticated → redirect to sign-in)
- [ ] `npx prisma studio` — can see User table with your test account

**Do not proceed until this checkpoint passes.** The foundation must be solid.

---

## 3. Step 1 — YouTube API Integration

**Goal:** A user connects their YouTube channel, and a dashboard page shows their real channel stats pulled via the YouTube API, cached in Redis.

**Time:** 3-5 days

### 3.1 Add YouTube thumbnail write scope

Update the OAuth scope to include thumbnail write access. This is needed for Step 3 but requesting it now avoids re-prompting the user later.

In `src/auth.ts`, add to the `scope` param:
```
https://www.googleapis.com/auth/youtube.upload
```

### 3.2 Create YouTube API client helper

Create `src/lib/youtube.ts`:

```typescript
import { google } from "googleapis"
import { redis } from "./redis"

function getOAuth2Client(refreshToken: string) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.YOUTUBE_CLIENT_ID,
    process.env.YOUTUBE_CLIENT_SECRET,
    `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/callback/google`
  )
  oauth2Client.setCredentials({ refresh_token: refreshToken })
  return oauth2Client
}

export async function getChannelStats(refreshToken: string) {
  const cacheKey = `youtube:channel:stats`
  const cached = await redis.get(cacheKey)
  if (cached) return JSON.parse(cached)

  const auth = getOAuth2Client(refreshToken)
  const youtube = google.youtube({ version: "v3", auth })

  // Get the authenticated user's channel
  const channelRes = await youtube.channels.list({
    part: ["statistics", "snippet"],
    mine: true,
  })

  const channel = channelRes.data.items?.[0]
  if (!channel) throw new Error("No YouTube channel found")

  const stats = {
    channelId: channel.id!,
    channelName: channel.snippet?.title ?? "Unknown",
    thumbnailUrl: channel.snippet?.thumbnails?.default?.url,
    subscriberCount: parseInt(channel.statistics?.subscriberCount ?? "0"),
    totalViews: parseInt(channel.statistics?.viewCount ?? "0"),
    totalVideos: parseInt(channel.statistics?.videoCount ?? "0"),
  }

  // Cache for 5 minutes
  await redis.set(cacheKey, JSON.stringify(stats), "EX", 300)

  return stats
}

export async function getRecentVideos(refreshToken: string, maxResults = 10) {
  const cacheKey = `youtube:videos:recent:${maxResults}`
  const cached = await redis.get(cacheKey)
  if (cached) return JSON.parse(cached)

  const auth = getOAuth2Client(refreshToken)
  const youtube = google.youtube({ version: "v3", auth })

  // First get the channel ID
  const channelRes = await youtube.channels.list({
    part: ["contentDetails"],
    mine: true,
  })

  const uploadsPlaylistId = channelRes.data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads
  if (!uploadsPlaylistId) throw new Error("No uploads playlist found")

  // Then get the recent videos from the uploads playlist
  const playlistRes = await youtube.playlistItems.list({
    part: ["snippet", "contentDetails"],
    playlistId: uploadsPlaylistId,
    maxResults,
  })

  const videoIds = playlistRes.data.items?.map(item => item.contentDetails?.videoId).filter(Boolean) ?? []

  // Batch fetch video statistics
  const videosRes = await youtube.videos.list({
    part: ["statistics", "snippet", "contentDetails"],
    id: videoIds,
  })

  const videos = videosRes.data.items?.map(video => ({
    videoId: video.id!,
    title: video.snippet?.title ?? "Untitled",
    thumbnailUrl: video.snippet?.thumbnails?.default?.url,
    publishedAt: video.snippet?.publishedAt,
    views: parseInt(video.statistics?.viewCount ?? "0"),
    likes: parseInt(video.statistics?.likeCount ?? "0"),
    comments: parseInt(video.statistics?.commentCount ?? "0"),
    duration: video.contentDetails?.duration,
    tags: video.snippet?.tags ?? [],
  })) ?? []

  await redis.set(cacheKey, JSON.stringify(videos), "EX", 300)
  return videos
}
```

### 3.3 Create the Channel model sync

Create `src/lib/channel-sync.ts`:

```typescript
import { prisma } from "./prisma"
import { getChannelStats } from "./youtube"

export async function syncUserChannel(userId: string, refreshToken: string) {
  const stats = await getChannelStats(refreshToken)

  const channel = await prisma.channel.upsert({
    where: { youtubeChannelId: stats.channelId },
    update: {
      channelName: stats.channelName,
      subscriberCount: stats.subscriberCount,
      totalViews: stats.totalViews,
      totalVideos: stats.totalVideos,
      statsUpdatedAt: new Date(),
    },
    create: {
      userId,
      youtubeChannelId: stats.channelId,
      channelName: stats.channelName,
      subscriberCount: stats.subscriberCount,
      totalViews: stats.totalViews,
      totalVideos: stats.totalVideos,
    },
  })

  // Also sync recent videos
  const { getRecentVideos } = await import("./youtube")
  const videos = await getRecentVideos(refreshToken)

  for (const video of videos) {
    await prisma.video.upsert({
      where: { youtubeVideoId: video.videoId },
      update: {
        title: video.title,
        thumbnailUrl: video.thumbnailUrl,
        views: video.views,
        likes: video.likes,
        comments: video.comments,
        tags: video.tags,
        publishedAt: new Date(video.publishedAt),
      },
      create: {
        channelId: channel.id,
        youtubeVideoId: video.videoId,
        title: video.title,
        thumbnailUrl: video.thumbnailUrl,
        views: video.views,
        likes: video.likes,
        comments: video.comments,
        tags: video.tags,
        publishedAt: new Date(video.publishedAt),
      },
    })
  }

  return channel
}
```

### 3.4 Create the dashboard page

Build `src/app/(dashboard)/dashboard/page.tsx`:

- If user has no connected channel → show "Connect Your YouTube Channel" CTA (popup to re-auth with YouTube scopes)
- If user has a connected channel → show:
  - Channel name, avatar, subscriber count (with green/red arrow vs last sync)
  - Total views (30-day)
  - Recent videos list (title, thumbnail, views, published date)
  - "Last updated: X minutes ago" with a "Refresh" button

Use Tremor components for the metric cards. Keep the design clean — dark mode first.

### 3.5 Create API route for channel connection

Create `src/app/api/channel/connect/route.ts`:

- Accepts POST from the dashboard
- Takes the user's Google refresh token from their NextAuth session
- Calls `syncUserChannel()`
- Returns channel stats

### 3.6 Step 1 Checkpoint

- [ ] User can sign in with Google (with YouTube scopes)
- [ ] Dashboard shows real YouTube channel data (subs, views, recent videos)
- [ ] "Refresh" button invalidates cache and pulls fresh data
- [ ] Redis caching works (confirm via Upstash dashboard — second refresh is instant)
- [ ] No hardcoded data — everything from the live YouTube API

**STOP HERE.** Show this to a real YouTube creator. Ask: "Would you use this instead of YouTube Studio?" Their answer will tell you if the hypothesis holds.

---

## 4. Step 2 — Content Gap Analyzer

**Goal:** User types a niche, system analyzes the top channels, identifies unsaturated topics, and returns 5 video ideas with opportunity scores.

**Time:** 1-2 weeks

### 4.1 Architecture overview

```
User types niche ──► API route ──► Background job (BullMQ)
                                      │
                                      ├──► YouTube Data API: search for top channels
                                      ├──► YouTube Data API: fetch each channel's recent videos
                                      ├──► LLM (GPT-4o): classify videos by topic
                                      ├──► Compute: calculate saturation scores
                                      ├──► LLM (GPT-4o): generate video ideas for top gaps
                                      │
                                      └──► Store in PostgreSQL ──► Return to UI
```

Use BullMQ so the user doesn't wait 30-60 seconds for the analysis. The API route creates a job and returns a `jobId`. The frontend polls for completion.

### 4.2 Set up BullMQ

Create `src/lib/queue.ts`:

```typescript
import { Queue, Worker, QueueScheduler } from "bullmq"
import { redis } from "./redis"

// Use the same Redis connection for BullMQ
const connection = redis

export const contentGapQueue = new Queue("content-gap-analysis", { connection })

// Worker runs in a separate process — create src/workers/content-gap-worker.ts
```

Create `src/workers/content-gap-worker.ts`:

```typescript
// This file runs as a separate process (npm run worker:content-gap)
import { Worker } from "bullmq"
import { redis } from "@/lib/redis"

const worker = new Worker("content-gap-analysis", async (job) => {
  const { niche, userId, refreshToken } = job.data
  
  // Step 1: Discover top channels in the niche
  // Step 2: Fetch each channel's recent videos
  // Step 3: Extract topics from video titles (LLM)
  // Step 4: Calculate saturation
  // Step 5: Estimate search demand
  // Step 6: Generate opportunity scores
  // Step 7: Generate video ideas for top gaps (LLM)
  // Step 8: Store in database
  
  return { gapCount: gaps.length, topScore: gaps[0]?.opportunityScore }
}, { connection: redis })
```

Add to `package.json`:

```json
{
  "scripts": {
    "worker:content-gap": "tsx src/workers/content-gap-worker.ts"
  }
}
```

### 4.3 Implement the Content Gap Analyzer pipeline

Create `src/lib/content-gap.ts` following the 9-step process from VISION.md Section 18.3.

Key implementation notes:

**Step 2 (discover channels):** Use `youtube.search.list()` with `type: "channel"`. All channel sizes included — micro-creators (<1k) capture emerging trends, large creators (>500k) show market saturation. The deterministic scoring engine uses log(subscriberCount) internally so extremes don't distort scores. Limit to top 8 channels to stay within quota.

**Step 3 (fetch videos):** For each of the top 20 channels, fetch their 50 most recent videos (last 6 months). This costs ~2,000 API units. Cache per-niche results for 7 days in PostgreSQL.

**Step 4 (topic extraction):** Send batches of 50 titles to GPT-4o. Prompt:
```
Categorize these YouTube video titles into topics. Return JSON:
[{"title": "...", "topic": "...", "format": "tutorial|review|vlog|listicle|other"}]
```
Cost: ~$0.10-0.30 per batch.

**Fallback:** If OpenAI is down or costs are a concern, fall back to keyword clustering using a simple TF-IDF approach (no LLM cost, less accurate but functional).

**Step 6 (search demand):** Use YouTube's `search.list()` `totalResults` field as a volume proxy. Do NOT use the unofficial auto-suggest endpoint — it's fragile and can break without notice.

**Step 7 (opportunity score):**
```
opportunity_score = (demand_score × 0.35) +
                    (competition_score × 0.30) +   // inverted saturation
                    (engagement_potential × 0.20) +
                    (trend_score × 0.15)
```

**Step 8 (generate video ideas):** For topics with opportunity_score > 70, prompt GPT-4o:
```
Here's a content gap in the [niche] niche: [topic].
Generate 5 video ideas. For each: title (3 variants), thumbnail concept,
script outline (hook + 3 key points + CTA), recommended tags, estimated length,
and a "why this idea" explanation.
```

### 4.4 Create the Content Gap UI

Build the page at `src/app/(dashboard)/dashboard/strategy/page.tsx`:

**Input state:**
- Text input: "What niche do you create content in?" (e.g., "productivity for developers")
- "Analyze" button
- Show estimated time: "This will take 30-60 seconds"

**Loading state:**
- Progress bar / skeleton cards
- Status updates: "Finding top channels..." → "Analyzing 850 videos..." → "Calculating opportunities..." → "Generating video ideas..."

**Results state:**
- Title: "Content Gaps for [Niche] — Updated just now"
- Cards for each gap (matching the mockup in VISION.md lines 969-989):
  - Opportunity score (0-100) with color coding (green > 80, yellow > 60, red < 60)
  - Topic title
  - Search demand level (HIGH / MEDIUM / LOW)
  - Competition level (LOW / MEDIUM / HIGH)
  - Estimated RPM range
  - "Why this gap" explanation
  - Action buttons: "View Titles" → expands to show 3 title variants
  - "View Outline" → expands to show script outline
  - "Generate Thumbnails" → placeholder (wired up in Step 3)

**Rate limiting:**
- Free tier: 1 analysis per 24 hours
- Paid tier: 3 analyses per 24 hours
- Show remaining quota in the UI

### 4.5 Step 2 Checkpoint

- [x] User types a niche → background job runs → results appear in ~45 seconds
- [x] Results show 5-15 content gaps with opportunity scores
- [x] Each gap has clickable title variants, script outlines, and tags
- [x] Running the same niche twice within 7 days returns cached results (instant)
- [x] Rate limiting works (can't spam the analyzer) — disabled for dev
- [x] OpenAI costs are tracked and visible in logs

**STOP HERE.** Show this to a real creator. Ask: "Would you pay $19/month for this?" Their answer tells you whether to continue.

---

## 5. Step 3 — A/B Test Manager & Thumbnail Generator

**Goal:** Generate AI thumbnails from a video title, upload 3 variants to YouTube for A/B testing, poll for results, and show which variant won — with an explanation of *why*.

**Time:** 1-2 weeks

### 5.1 Set up image infrastructure

**Create `src/lib/storage.ts`:**

```typescript
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3"

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
})

export async function uploadThumbnail(buffer: Buffer, key: string): Promise<string> {
  await r2.send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    Key: key,
    Body: buffer,
    ContentType: "image/png",
  }))

  return `https://cdn.creatorforge.com/${key}` // Configure custom domain for R2
}
```

### 5.2 Thumbnail generation pipeline

Create `src/lib/thumbnail-generator.ts`:

- Uses Replicate (Stable Diffusion) for image generation — ~$0.002/image vs DALL-E's ~$0.04/image
- Prompt includes: video title, user's brand colors (from Channel.brandColors), user's face reference (composited with Sharp), style preferences
- Generates 8-12 variants with different: color schemes, text placements, compositions, facial expressions
- "No text" mode generates backgrounds only — user adds text manually (avoids the AI text quality problem)
- Store generated images in R2, reference URLs in PostgreSQL

### 5.3 Thumbnail A/B Test UI

Build the page at `src/app/(dashboard)/dashboard/thumbnails/page.tsx`:

**Generation screen:**
- Input: video title (or select from a content gap suggestion)
- Input: optional description of desired thumbnail style
- "Generate" button → loading state with progress → grid of 8-12 variants
- User can select up to 3 for testing

**Test management screen:**
- Shows active tests with: video title, 3 thumbnail previews, test duration, current CTRs
- Status badges: "Running" / "Winner Declared" / "Inconclusive"
- Winner announcement with: winning thumbnail highlighted, CTR comparison, confidence level
- "Why it won" analysis (GPT-4 Vision): element-by-element breakdown of color, text placement, facial expression, composition
- "Apply to future" button: saves winning pattern to user's brand preferences

### 5.4 YouTube thumbnail upload integration

Create `src/lib/youtube-thumbnail.ts`:

```typescript
export async function uploadThumbnailToYouTube(
  refreshToken: string,
  videoId: string,
  imageBuffer: Buffer
) {
  const auth = getOAuth2Client(refreshToken)
  const youtube = google.youtube({ version: "v3", auth })

  await youtube.thumbnails.set({
    videoId,
    media: {
      body: require("stream").Readable.from(imageBuffer),
    },
  })

  // YouTube's native A/B test runs automatically when multiple
  // thumbnails are available. No separate "start test" API endpoint.
}
```

### 5.5 A/B test polling worker

Create `src/workers/ab-test-worker.ts`:

- BullMQ cron job, runs every 4 hours
- For each active ThumbnailTest in PostgreSQL:
  - Pulls watch time data from YouTube Analytics API
  - Compares across test period
  - If confidence > 95% → declare winner, update DB, notify user (email)
  - If test has run > 14 days → auto-conclude with best available data
- Polling is the only option — YouTube has no webhook/callback for test results

### 5.6 "Why it won" analysis (GPT-4 Vision)

Create `src/lib/thumbnail-analysis.ts`:

- After a winner is declared, send all 3 thumbnail images to GPT-4 Vision
- Prompt asks for element-by-element comparison: color palette, text size/placement, facial expression, composition, contrast, emotion
- Returns structured JSON with per-element scores and a primary factor
- Store in ThumbnailTest table

### 5.7 Step 3 Checkpoint

- [ ] User enters a title → generates 8-12 thumbnail variants
- [ ] User selects 3 → uploads to YouTube via API
- [ ] Background worker polls and detects winner (or test with mock data first)
- [ ] Winner declared with "why it won" analysis
- [ ] Thumbnails stored in R2, served via CDN URL
- [ ] Image generation costs tracked (< $0.01 per generation with Replicate)

**STOP HERE.** Show this to a real creator. Ask: "Would you switch from TubeBuddy's A/B testing for this?"

---

## 6. Step 4 — Analytics Dashboard & Onboarding

**Goal:** Tie everything together. Build the full analytics dashboard, the 3-screen onboarding wizard, and Stripe billing. This is the product.

**Time:** 1-2 weeks

### 6.1 Analytics dashboard

Build the full dashboard at `src/app/(dashboard)/dashboard/analytics/page.tsx`:

**Channel Overview cards:**
- Subscriber growth (30-day, with sparkline)
- Total views (30-day)
- Average CTR (across all recent videos)
- Average retention
- Estimated revenue (based on RPM estimates for the niche)
- Comparison to previous period (green/red arrows + percentage)

**Video Performance Table:**
- Sortable table of recent videos with: thumbnail, title, views, CTR, retention, publish date
- Click to expand: retention graph (placeholder for now — use YouTube's embed), traffic sources, audience demographics
- Highlight row if video is underperforming vs channel average

**Content-Type Performance:**
- Groups videos by format (tutorial, vlog, review, etc.)
- Shows average views, CTR, retention per format
- "Your tutorials get 2.3x more views than your vlogs" insights
- Recommendation: "Make more tutorials. For vlogs, fix retention by shortening intros."

### 6.2 Onboarding wizard

Build the onboarding flow at `src/app/(dashboard)/onboarding/page.tsx`:

**Screen 1 — Niche Selection:**
- "What's your niche?" — select from a categorized list or type custom
- "What kind of content do you make?" — checkboxes: Tutorials, Reviews, Vlogs, Commentary, etc.
- Progress bar: Step 1 of 3

**Screen 2 — Competitor Setup:**
- "Add 3 competitors you want to track" — search by channel name, select from results
- Optional: "Skip for now"
- Progress bar: Step 2 of 3

**Screen 3 — Brand Setup:**
- "Set your brand colors" — color picker for primary + accent (hex codes)
- "Upload a face reference photo" — for thumbnail generation
- "Choose a font style" — dropdown
- "Finish" → redirects to dashboard

### 6.3 Stripe billing

- Set up Stripe products: Basic ($19/mo), Pro ($39/mo, future Phase 2)
- Create pricing page at `src/app/(dashboard)/dashboard/billing/page.tsx`
- Stripe Checkout integration — redirect to Stripe, handle webhook for subscription status
- Free trial: 14 days
- Feature gating: content gap analyzer limited to 1/run per 24h on free tier; A/B testing is paid-only

### 6.4 Additional pages

- `src/app/(dashboard)/dashboard/settings/page.tsx` — channel settings, brand preferences, API connection status
- `src/app/(dashboard)/dashboard/seo/page.tsx` — SEO scorecard per-video (can be simplified in v1)

### 6.5 Step 4 Checkpoint

- [ ] Full dashboard with real data (not mock data)
- [ ] Onboarding wizard works end-to-end
- [ ] Stripe billing processes real payments
- [ ] Feature gating works (free vs paid)
- [ ] Content Gap → Thumbnails → A/B Test → Analytics flow works end-to-end

---

## 7. Step 5 — Polish, Landing Page, Launch

**Goal:** Ship it.

**Time:** 1-2 weeks

### 7.1 Landing page

Build `src/app/page.tsx`:

- Hero section: "Replace vidIQ + TubeBuddy with one platform. Strategy. Testing. Analytics. Together."
- Feature sections: Content Gap Analyzer, AI Thumbnails + A/B Testing, Analytics Dashboard
- Pricing section: Free vs Basic ($19/mo)
- Social proof: testimonials from your 3-5 test creators
- CTA: "Connect Your YouTube Channel — Free 14-Day Trial"

### 7.2 Polish

- Dark mode audit — make sure everything looks good in dark mode (creators work late)
- Loading states — no blank screens, every async operation has a skeleton/spinner
- Error states — API failures show friendly messages, not stack traces
- Mobile responsive — dashboard should work on phone (creators check stats on mobile)
- Favicon, meta tags, OG image

### 7.3 Pre-launch checklist

- [ ] Privacy policy page (required for Google OAuth verification)
- [ ] Terms of service page
- [ ] Contact/support email set up
- [ ] Analytics (Vercel Analytics or Plausible)
- [ ] Error monitoring (Sentry free tier)
- [ ] Rate limiting on all API routes
- [ ] YouTube API quota monitoring (alert at 80% usage)
- [ ] Backup strategy for database (Supabase automated backups)

### 7.4 Launch

1. **Product Hunt** — schedule launch, prepare assets, engage with comments
2. **Reddit** — post to r/NewTubers, r/PartneredYoutube, r/YouTube, r/SmallYTChannel
3. **Direct outreach** — DM 10-20 creators who have complained about vidIQ/TubeBuddy on social media
4. **Build in public** — tweet/thread about the build process, tag the creator community

### 7.5 Step 5 Checkpoint

- [ ] Landing page live
- [ ] Product Hunt launch scheduled
- [ ] 5+ test creators have used the full product
- [ ] At least 1 paying customer (even if it's discounted)

---

## 8. What We Are NOT Building (Phase 1)

Explicitly out of scope. If you find yourself working on any of these, stop — you're building the wrong thing.

- ❌ Video editor (no Premiere/DaVinci/CapCut replacement)
- ❌ Generic social media scheduler (our scheduler is strategy-connected, Phase 2)
- ❌ Content repurpose engine (Phase 3)
- ❌ Niche discovery wizard (Phase 4)
- ❌ Brand deal / sponsorship CRM (Phase 4)
- ❌ Team collaboration features (Phase 4)
- ❌ Mobile app (web-first, responsive is good enough)
- ❌ Multi-platform support — TikTok, Instagram, X (Phase 2)
- ❌ Custom analytics dashboards / report builder
- ❌ API for third-party integrations
- ❌ White-label / agency features
- ❌ In-app video player / watch page
- ❌ Community features / comments

---

## 9. Decision Log

Record significant decisions here as they happen. This prevents re-litigating the same choices.

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-04-27 | Next.js 14 App Router over Pages Router | Server components, API routes in same codebase |
| 2026-04-27 | Supabase over Neon for PostgreSQL | Free tier is more generous (500MB vs 0.5GB, but Supabase has better tooling) |
| 2026-04-27 | Replicate SD over DALL-E for thumbnails | $0.002 vs $0.04 per image. Switch to DALL-E later if quality is insufficient |
| 2026-04-27 | Tremor over Recharts for charts | Cleaner default look, less custom styling needed |
| 2026-04-27 | BullMQ over Inngest for job queue | BullMQ is free + Redis; Inngest has usage limits on free tier |
| 2026-04-27 | Build content gap analyzer BEFORE A/B testing | Riskier assumption — validates if creators want data-driven strategy |
| 2026-04-28 | Propagate videoId through LLM classification | Title-based joins silently drop videos when LLM normalizes titles. videoId is stable, title is not. |
| 2026-04-28 | Recency-weighted effective video count in scoring | Old videos (60+ days) shouldn't make a topic look oversupplied. Use exponential decay: 2^(-ageDays/60). |
| 2026-04-28 | Remove subscriber range filter from channel discovery | Micro-creators surface emerging trends. Large creators indicate saturation. log(subCount) in scoring handles extremes. |
| 2026-04-28 | Bucket numeric scores as tiers before LLM prompt | Passing exact numbers (82/100, 75/100) biases LLM copy generation. Use TOP_10%/HIGH/MID/LOW instead. |
| 2026-04-28 | CONTENT_GAP_REAL_DEMAND enabled in DEV | Real YouTube autocomplete + Google Trends now used even with mock channels/videos. Env var was mis-formatted (escaped quotes). |
| 2026-04-28 | Fix niche-specific gaps API endpoint | /api/strategy/gaps returned globally most-recent niche, not the requested one. Added ?niche= param with case-insensitive fallback. |
| 2026-04-27 | Landing page LAST, not first | Product is the pitch. No traffic to market to until product exists |

---

## Quick Reference — Daily Standup Questions

Ask yourself these every day:

1. **What am I building today?** — Which step/section?
2. **Does this ship something I can show a creator?** — If no, question whether it's necessary right now.
3. **Am I building something from the "NOT Building" list?** — If yes, stop.
4. **Is this the simplest thing that works?** — Polish comes in Step 5. Cut corners now, clean up later.

---

*This document should be updated as decisions change. When you deviate from the plan, update the plan — don't let it go stale. A stale plan is worse than no plan.*
