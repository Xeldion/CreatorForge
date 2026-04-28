# CreatorForge — Scaffold Documentation

> **What this is:** A complete reference for the project structure, conventions, and setup.
> If something isn't obvious from reading the code, it should be documented here.
>
> **Last updated:** April 28, 2026
> **Initial commit:** `49833f1`

---

## Table of Contents

1. [Project Structure](#1-project-structure)
2. [Monorepo Architecture](#2-monorepo-architecture)
3. [Package Reference](#3-package-reference)
4. [Conventions](#4-conventions)
5. [Environment Variables](#5-environment-variables)
6. [Development Workflow](#6-development-workflow)
7. [Database](#7-database)
8. [Authentication](#8-authentication)
9. [API Integration](#9-api-integration)
10. [Deployment](#10-deployment)

---

## 1. Project Structure

```
creatorforge/
├── apps/
│   ├── web/                    # Next.js 14 App Router (frontend + API routes)
│   │   ├── src/
│   │   │   ├── app/
│   │   │   │   ├── (auth)/signin/     # Sign-in page
│   │   │   │   ├── (dashboard)/       # All authenticated routes
│   │   │   │   │   ├── layout.tsx      # Sidebar + nav layout
│   │   │   │   │   └── dashboard/
│   │   │   │   │       ├── page.tsx            # Channel overview
│   │   │   │   │       ├── analytics/page.tsx  # Video performance
│   │   │   │   │       ├── strategy/page.tsx   # Content gap analyzer
│   │   │   │   │       ├── ideas/page.tsx      # Video idea generator
│   │   │   │   │       ├── thumbnails/page.tsx # Thumbnail gen + A/B tests
│   │   │   │   │       ├── seo/page.tsx        # SEO scorecard
│   │   │   │   │       ├── settings/page.tsx   # Channel settings
│   │   │   │   │       └── billing/page.tsx    # Subscription
│   │   │   │   ├── api/auth/[...nextauth]/     # NextAuth API route
│   │   │   │   ├── layout.tsx                  # Root layout (dark mode)
│   │   │   │   └── page.tsx                    # Landing page
│   │   │   ├── components/          # React components (empty — fill as you build)
│   │   │   ├── lib/
│   │   │   │   ├── auth.ts          # NextAuth configuration
│   │   │   │   └── redis.ts         # Redis client singleton
│   │   │   └── styles/
│   │   │       └── globals.css      # Tailwind + dark mode CSS variables
│   │   ├── next.config.js
│   │   ├── tailwind.config.js
│   │   └── tsconfig.json            # Extends @creatorforge/typescript/nextjs.json
│   │
│   └── workers/                # BullMQ background workers
│       └── src/
│           ├── runner.ts            # Worker entrypoint (runs one or all workers)
│           ├── redis.ts             # Redis client for BullMQ
│           └── workers/
│               ├── content-gap.ts   # Content gap analyzer (Step 2)
│               └── ab-test.ts       # A/B test polling (Step 3)
│
├── packages/
│   ├── ai/                     # OpenAI client + LLM helpers
│   │   └── src/index.ts        # chat(), chatStructured(), analyzeImages()
│   ├── config/                 # Environment validation
│   │   └── src/index.ts        # Zod schema + env() singleton
│   ├── database/               # Prisma schema + client
│   │   ├── prisma/schema.prisma
│   │   └── src/index.ts        # PrismaClient singleton
│   ├── storage/                # Cloudflare R2 client
│   │   └── src/index.ts        # uploadFile(), uploadThumbnail(), etc.
│   ├── strategy/               # Content gap analyzer pipeline
│   │   └── src/
│   │       ├── index.ts        # Main pipeline (7 steps)
│   │       ├── analytics.ts    # Deterministic scoring engine
│   │       └── demand.ts       # Demand estimation (autocomplete + Trends)
│   └── youtube/                # YouTube Data API v3 client
│       └── src/index.ts        # createYouTubeClient() + types
│
├── tooling/
│   ├── eslint/                 # Shared ESLint config
│   │   ├── index.js            # Base config (TypeScript strict)
│   │   └── nextjs.js           # Next.js-specific rules
│   └── typescript/             # Shared TypeScript configs
│       ├── base.json           # Base (strict, ESNext)
│       ├── nextjs.json         # Next.js (DOM libs, JSX)
│       └── worker.json         # Worker (NodeNext module)
│
├── docker/
│   └── Dockerfile.workers      # Production worker image
│
├── .env.example                # All required environment variables
├── .gitignore
├── BUILD-PLAN.md               # Phase 1 execution guide
├── package.json                # Root — workspaces + scripts
├── turbo.json                  # Turborepo pipeline config
└── VISION.md                   # Product vision & strategy
```

---

## 2. Monorepo Architecture

### Workspace packages

| Package | Purpose | Dependencies |
|---------|---------|-------------|
| `@creatorforge/web` | Next.js app (frontend + API routes) | All other packages |
| `@creatorforge/workers` | BullMQ background workers | ai, config, database, storage, youtube, strategy |
| `@creatorforge/strategy` | Content gap analyzer pipeline + scoring engine | ai, database, youtube |
| `@creatorforge/ai` | OpenAI/LLM utilities | config |
| `@creatorforge/config` | Env validation (Zod) | None |
| `@creatorforge/database` | Prisma ORM | None (peer: Prisma) |
| `@creatorforge/storage` | R2/S3 storage | config |
| `@creatorforge/youtube` | YouTube API client | config |

### Dependency flow

```
web ──────► ai, config, database, storage, youtube
workers ──► ai, config, database, storage, youtube
             ▲
             └── config is the only shared dependency among leaf packages
```

### Why this structure

- **apps/web** and **apps/workers** are deployed separately (Vercel + Railway)
- **packages/** contain business logic shared across both
- **tooling/** is dev-only — never deployed
- **config** validates env vars once at startup — every other package trusts it
- YouTube API calls are abstracted behind `createYouTubeClient()` so they can be mocked in tests

---

## 3. Package Reference

### @creatorforge/config

```typescript
import { env } from "@creatorforge/config";

// ✅ Do this — validated at startup, typed
const dbUrl = env().DATABASE_URL;

// ❌ NEVER do this — no validation, no types
const dbUrl = process.env.DATABASE_URL;
```

The `env()` singleton validates all environment variables against a Zod schema on first call. If validation fails, the process crashes with a descriptive error. This prevents silent failures from missing env vars.

### @creatorforge/database

```typescript
import { prisma } from "@creatorforge/database";

// Singleton PrismaClient — reused across hot reloads in dev
const user = await prisma.user.findUnique({ where: { email } });
```

The Prisma schema is at `packages/database/prisma/schema.prisma`. After modifying it, run:
```bash
npm run db:generate    # Regenerate Prisma Client
npm run db:push        # Push schema to dev database (no migrations)
npm run db:migrate     # Create a migration (for production)
```

### @creatorforge/youtube

```typescript
import { createYouTubeClient } from "@creatorforge/youtube";

const yt = createYouTubeClient(userRefreshToken);

const stats = await yt.getMyChannel();
const videos = await yt.getRecentVideos(10);
const channels = await yt.searchChannels("tech productivity");
const channelVideos = await yt.getChannelVideos(channelId);
```

`createYouTubeClient()` returns a typed interface. The refresh token comes from the user's NextAuth Account record.

### @creatorforge/ai

```typescript
import { chat, chatStructured, analyzeImages } from "@creatorforge/ai";
import { z } from "zod";

// Simple text response
const reply = await chat([{ role: "user", content: "..." }]);

// Structured JSON with Zod validation
const schema = z.object({ topics: z.array(z.string()) });
const result = await chatStructured(messages, schema);

// Vision analysis (for thumbnail winner analysis)
const analysis = await analyzeImages("Compare these thumbnails", imageUrls);
```

### @creatorforge/storage

```typescript
import { uploadThumbnail, uploadFaceReference } from "@creatorforge/storage";

const url = await uploadThumbnail(userId, testId, "variant_a", imageBuffer);
// Returns: "https://cdn.creatorforge.com/thumbnails/user_42/test_abc/variant_a.png"
```

---

## 4. Conventions

### TypeScript

- **Strict mode everywhere.** `strict: true`, `strictNullChecks: true`, `noUncheckedIndexedAccess: true`.
- **Type imports use `import type`.** Enforced by ESLint (`@typescript-eslint/consistent-type-imports`).
- **No `any` without good reason.** ESLint warns. Use `unknown` and narrow.
- **Unused imports are errors.** Auto-fixed on save by `unused-imports` plugin.

### Naming

- **Files:** `kebab-case.ts` for modules, `PascalCase.tsx` for components
- **Functions:** `camelCase()`
- **Types/Interfaces:** `PascalCase`
- **Database models:** `PascalCase` (Prisma convention)
- **API routes:** `route.ts` (Next.js convention)

### Imports

- **Server-only imports:** Packages that access `process.env` or use Node APIs must ONLY be imported in Server Components or API routes. Never import `@creatorforge/youtube`, `@creatorforge/database`, or `@creatorforge/ai` in a Client Component.
- **Import order (auto-fixed):** builtin → external → internal → parent/sibling → index → type

### React

- **Server Components by default.** Only use `"use client"` when you need interactivity (state, effects, event handlers).
- **Data fetching in Server Components.** Use `async` components with direct Prisma/API calls.
- **No `useEffect` for data fetching.** Client Components that need data should receive it as props.

### Error handling

- **Server-side:** Throw errors. Next.js error boundaries catch them.
- **API routes:** Return `NextResponse.json({ error: "..." }, { status: 400 })`.
- **Never expose stack traces to the client.** Log the full error server-side, return a user-friendly message.

---

## 5. Environment Variables

All variables are defined in `.env.example` and validated by `@creatorforge/config`.

### Required for development

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection (Supabase free tier) |
| `AUTH_SECRET` | NextAuth encryption key |
| `AUTH_GOOGLE_ID` | Google OAuth client ID |
| `AUTH_GOOGLE_SECRET` | Google OAuth client secret |
| `YOUTUBE_API_KEY` | YouTube Data API v3 key |
| `REDIS_URL` | Upstash Redis connection |
| `OPENAI_API_KEY` | OpenAI API key |
| `NEXT_PUBLIC_APP_URL` | App URL (http://localhost:3000 in dev) |

### Optional for development

| Variable | Needed for |
|----------|-----------|
| `DEVELOPMENT_MODE` | Skip YouTube API, use mock channels/videos |
| `CONTENT_GAP_REAL_DEMAND` | Use real autocomplete + Trends even with mock data (requires DEVELOPMENT_MODE=true) |
| `R2_*` | Thumbnail storage (Step 3) |
| `REPLICATE_API_TOKEN` | Thumbnail generation (Step 3) |
| `RESEND_API_KEY` | Email notifications (Step 4) |
| `STRIPE_*` | Billing (Step 4) |
| `SENTRY_DSN` | Error monitoring (Step 5) |

### Setup

```bash
cp .env.example .env.local
# Fill in .env.local with your actual values
```

---

## 6. Development Workflow

### Starting the app

```bash
npm run dev              # Start Next.js dev server (with Turborepo)
```

This starts `apps/web` on port 3000. The dashboard is at `http://localhost:3000/dashboard`.

### Running workers (for Steps 2+)

```bash
npm run worker:content-gap   # Content gap analyzer
npm run worker:ab-test       # A/B test polling
```

### Database

```bash
npm run db:generate    # Regenerate Prisma Client after schema changes
npm run db:push        # Push schema to dev DB (quick, no migration)
npm run db:migrate     # Create a named migration
npm run db:studio      # Open Prisma Studio (GUI) at localhost:5555
```

### Type checking

```bash
npm run typecheck      # Type-check all packages (via Turborepo)
```

### Linting

```bash
npm run lint           # Lint all packages
npm run format         # Format with Prettier
```

---

## 7. Database

### Provider

PostgreSQL via Supabase (free tier: 500MB). Connection string in `DATABASE_URL`.

### Schema

Full schema at `packages/database/prisma/schema.prisma`. Key models:

| Model | Purpose | Built in Step |
|-------|---------|---------------|
| `User` | NextAuth user accounts | 0 |
| `Account` | OAuth provider accounts | 0 |
| `Session` | NextAuth sessions | 0 |
| `Channel` | Connected YouTube channels | 1 |
| `Video` | Cached video metadata | 1 |
| `Competitor` | Tracked competitor channels | 2 |
| `CompetitorVideo` | Competitor's video data | 2 |
| `ThumbnailTest` | A/B test records | 3 |
| `ContentGap` | Content gap analysis results | 2 |
| `Onboarding` | Onboarding wizard progress | 4 |

### Caching strategy

- YouTube API responses are cached in Redis (5-minute TTL for channel stats, 7-day TTL for content gap results)
- PostgreSQL stores the canonical data
- Redis is a read-through cache — the app checks Redis first, falls back to API + DB, then populates Redis

---

## 8. Authentication

### Provider

Google OAuth via NextAuth.js v5 (beta). Users sign in with their Google account.

### YouTube scopes requested

```
https://www.googleapis.com/auth/yt-analytics.readonly  # Analytics data
https://www.googleapis.com/auth/youtube.readonly       # Channel/video data
https://www.googleapis.com/auth/youtube.upload         # Thumbnail upload (for A/B testing)
```

Scopes are requested at sign-in. The `offline` access type and `prompt: consent` ensure we get a refresh token.

### Session

Session contains `user.id`, `user.name`, `user.email`, `user.image`. The `user.id` is the Prisma User ID. The Google refresh token is stored encrypted in the `Account` model.

---

## 9. API Integration

### YouTube Data API v3

- **Quota:** 10,000 units/day (free tier). Each API call costs 1-100 units.
- **Caching:** All YouTube API responses are cached in Redis. Never call the API directly from a client component.
- **Competitor analysis:** Public data (channel stats, video lists) does not require the competitor's permission.
- **Thumbnail upload:** Requires the `youtube.upload` scope. YouTube's native A/B test runs automatically when multiple thumbnails are uploaded.

### YouTube Analytics API

- **Quota:** 1,000,000 units/day (free tier).
- **Used for:** CTR, average retention, revenue estimates, audience demographics.
- **Limitation:** Only available for the authenticated user's OWN channel. Cannot pull analytics for competitors.

### OpenAI API

- **Models:** GPT-4o for text generation, GPT-4o for vision analysis, DALL-E 3 or Replicate SD for thumbnails.
- **Cost tracking:** Log token usage in each API call. Set a spending limit in the OpenAI dashboard.

---

## 10. Deployment

### Phase 1 target

| Service | Platform | Estimated cost |
|---------|----------|---------------|
| Next.js app | Vercel Pro | $20/month |
| Background workers | Railway | $10-20/month |
| PostgreSQL | Supabase | $0 (free tier) |
| Redis | Upstash | $0 (free tier) |
| Thumbnail storage | Cloudflare R2 | $0 (free tier: 10GB) |
| Email | Resend | $0 (free tier: 100/day) |
| **Total** | | **$30-40/month** |

### Worker deployment

Workers run as separate Railway services. Each worker type can be scaled independently:

```dockerfile
# docker/Dockerfile.workers
CMD ["node", "dist/runner.js", "content-gap"]  # Override per service
```

### Pre-launch checklist

See `BUILD-PLAN.md` Section 7.3 for the full checklist.

---

*Update this document when you add new packages, change conventions, or discover quirks. It should always reflect reality, not aspiration.*
