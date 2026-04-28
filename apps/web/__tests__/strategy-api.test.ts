/**
 * API route tests for strategy endpoints.
 *
 * Tests:
 *   GET  /api/strategy/gaps        — auth, empty, data
 *   POST /api/strategy/analyze     — validation, auth, rate limit, Google token
 *   GET  /api/strategy/analyze      — auth, jobId required, status
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mock dependencies
// ---------------------------------------------------------------------------

const mockAuth = vi.fn();
const mockPrismaFindFirst = vi.fn();
const mockPrismaFindMany = vi.fn();
const mockPrismaDeleteMany = vi.fn();
const mockPrismaCreateMany = vi.fn();
const mockPrismaAccountFindFirst = vi.fn();

const mockQueueAdd = vi.fn();
const mockQueueGetJob = vi.fn();
const mockJobGetState = vi.fn();

const mockRedisGet = vi.fn();
const mockRedisTtl = vi.fn();
const mockRedisPipeline = vi.fn();
const mockRedisIncr = vi.fn();
const mockRedisExpire = vi.fn();
const mockRedisExec = vi.fn();

vi.mock("@/lib/auth", () => ({
  auth: () => mockAuth(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    contentGap: {
      findFirst: (...args: unknown[]) => mockPrismaFindFirst(...args),
      findMany: (...args: unknown[]) => mockPrismaFindMany(...args),
      deleteMany: (...args: unknown[]) => mockPrismaDeleteMany(...args),
      createMany: (...args: unknown[]) => mockPrismaCreateMany(...args),
    },
    account: {
      findFirst: (...args: unknown[]) => mockPrismaAccountFindFirst(...args),
    },
  },
}));

vi.mock("@/lib/queue", () => ({
  contentGapQueue: {
    add: (...args: unknown[]) => mockQueueAdd(...args),
    getJob: (...args: unknown[]) => mockQueueGetJob(...args),
  },
  getJobStatus: async (queueName: string, jobId: string) => {
    const job = await mockQueueGetJob(jobId);
    if (!job) return { status: "not-found" as const };
    const state = await mockJobGetState();
    return {
      status: state,
      progress: 0,
      result: null,
      failedReason: job.failedReason ?? null,
    };
  },
}));

vi.mock("@/lib/redis", () => ({
  redis: {
    get: (...args: unknown[]) => mockRedisGet(...args),
    ttl: (...args: unknown[]) => mockRedisTtl(...args),
    pipeline: () => ({
      incr: (...args: unknown[]) => mockRedisIncr(...args),
      expire: (...args: unknown[]) => mockRedisExpire(...args),
      exec: () => mockRedisExec(),
    }),
  },
}));

// ---------------------------------------------------------------------------
// Dynamic import helper (imports after mocks are set up)
// ---------------------------------------------------------------------------

async function importRoutes() {
  const mod = await import("@/app/api/strategy/gaps/route");
  const analyzeMod = await import("@/app/api/strategy/analyze/route");
  return { gapsGet: mod.GET, analyzePost: analyzeMod.POST, analyzeGet: analyzeMod.GET };
}

// Helper: create a mock Next.js Request
function createRequest(options: {
  method?: string;
  body?: unknown;
  searchParams?: Record<string, string>;
}): Request {
  const url = new URL("http://localhost:3000/api/strategy/analyze");
  if (options.searchParams) {
    Object.entries(options.searchParams).forEach(([k, v]) =>
      url.searchParams.set(k, v)
    );
  }

  return new Request(url.toString(), {
    method: options.method ?? "GET",
    ...(options.body !== undefined
      ? { body: JSON.stringify(options.body) }
      : {}),
    headers: { "Content-Type": "application/json" },
  });
}

// ---------------------------------------------------------------------------
// Reset
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

// ===========================================================================
// GET /api/strategy/gaps
// ===========================================================================

describe("GET /api/strategy/gaps", () => {
  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);

    const { gapsGet } = await importRoutes();
    const res = await gapsGet();
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 401 when session has no user", async () => {
    mockAuth.mockResolvedValue({ user: null });

    const { gapsGet } = await importRoutes();
    const res = await gapsGet();
    const body = await res.json();

    expect(res.status).toBe(401);
  });

  it("returns empty when user has no analyses", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user-1" } });
    mockPrismaFindFirst.mockResolvedValue(null);

    const { gapsGet } = await importRoutes();
    const res = await gapsGet();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.gaps).toEqual([]);
    expect(body.niche).toBeNull();
    expect(body.message).toContain("No analyses yet");
  });

  it("returns gaps when user has stored analyses", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user-1" } });
    mockPrismaFindFirst.mockResolvedValue({
      niche: "react tutorials",
      generatedAt: new Date("2026-04-27T12:00:00Z"),
    });
    mockPrismaFindMany.mockResolvedValue([
      {
        id: "gap-1",
        topic: "React Server Components",
        searchVolumeEstimate: "HIGH",
        competitionScore: 25,
        opportunityScore: 88,
        suggestedTitles: ["Title A", "Title B", "Title C"],
        suggestedTags: ["react", "nextjs"],
        scriptOutline: "Hook → Points",
        thumbnailConcept: "Split screen",
        estimatedRpm: "$8-15",
      },
    ]);

    const { gapsGet } = await importRoutes();
    const res = await gapsGet();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.gaps).toHaveLength(1);
    expect(body.gaps[0].topic).toBe("React Server Components");
    expect(body.gaps[0].searchVolumeEstimate).toBe("HIGH");
    expect(body.gaps[0].suggestedTitles).toEqual(["Title A", "Title B", "Title C"]);
    expect(body.niche).toBe("react tutorials");
    expect(body.generatedAt).toBe("2026-04-27T12:00:00.000Z");
  });
});

// ===========================================================================
// POST /api/strategy/analyze
// ===========================================================================

describe("POST /api/strategy/analyze", () => {
  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);

    const { analyzePost } = await importRoutes();
    const req = createRequest({ method: "POST", body: { niche: "react" } });
    const res = await analyzePost(req);
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 400 for invalid JSON body", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user-1" } });

    const { analyzePost } = await importRoutes();
    const req = new Request("http://localhost:3000/api/strategy/analyze", {
      method: "POST",
      body: "not-json",
      headers: { "Content-Type": "application/json" },
    });
    const res = await analyzePost(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toContain("Invalid JSON");
  });

  it("returns 400 when niche is too short (< 3 chars)", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user-1" } });

    const { analyzePost } = await importRoutes();
    const req = createRequest({ method: "POST", body: { niche: "ab" } });
    const res = await analyzePost(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBeDefined();
  });

  it("returns 400 when niche is too long (> 100 chars)", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user-1" } });

    const { analyzePost } = await importRoutes();
    const req = createRequest({
      method: "POST",
      body: { niche: "a".repeat(101) },
    });
    const res = await analyzePost(req);
    const body = await res.json();

    expect(res.status).toBe(400);
  });

  it("does NOT rate limit (rate limiting removed for dev)", async () => {
    // Even when Redis shows previous usage, the route should succeed
    // because rate limiting was removed.
    mockAuth.mockResolvedValue({ user: { id: "user-1" } });
    mockRedisGet.mockResolvedValue("100"); // would have been rate limited
    mockPrismaAccountFindFirst.mockResolvedValue({
      refresh_token: "google-refresh-token-xyz",
    });
    mockQueueAdd.mockResolvedValue({ id: "job-123" });
    mockRedisExec.mockResolvedValue(null);

    const { analyzePost } = await importRoutes();
    const req = createRequest({ method: "POST", body: { niche: "react" } });
    const res = await analyzePost(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.jobId).toBe("job-123");
  });

  it("returns 400 when no Google account connected", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user-1" } });
    mockRedisGet.mockResolvedValue(null); // not rate limited
    mockPrismaAccountFindFirst.mockResolvedValue(null); // no Google account

    const { analyzePost } = await importRoutes();
    const req = createRequest({ method: "POST", body: { niche: "react" } });
    const res = await analyzePost(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toContain("No YouTube account");
  });

  it("enqueues job and returns jobId on success", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user-1" } });
    mockRedisGet.mockResolvedValue(null);
    mockPrismaAccountFindFirst.mockResolvedValue({
      refresh_token: "google-refresh-token-xyz",
    });
    mockQueueAdd.mockResolvedValue({ id: "job-abc-123" });
    mockRedisIncr.mockReturnValue({ exec: mockRedisExec });
    mockRedisExpire.mockReturnValue({ exec: mockRedisExec });
    mockRedisExec.mockResolvedValue(null);

    const { analyzePost } = await importRoutes();
    const req = createRequest({
      method: "POST",
      body: { niche: "  react tutorials  " },
    });
    const res = await analyzePost(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.jobId).toBe("job-abc-123");
    expect(body.message).toContain("started");

    // Verify queue was called with trimmed niche
    expect(mockQueueAdd).toHaveBeenCalledWith("analyze", {
      userId: "user-1",
      niche: "react tutorials", // trimmed
      refreshToken: "google-refresh-token-xyz",
    });
  });
});

// ===========================================================================
// GET /api/strategy/analyze?jobId=
// ===========================================================================

describe("GET /api/strategy/analyze", () => {
  it("returns 401 when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);

    const { analyzeGet } = await importRoutes();
    const req = createRequest({ searchParams: { jobId: "job-1" } });
    const res = await analyzeGet(req);
    const body = await res.json();

    expect(res.status).toBe(401);
  });

  it("returns 400 when ?jobId= is missing", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user-1" } });

    const { analyzeGet } = await importRoutes();
    const req = createRequest({});
    const res = await analyzeGet(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toContain("jobId");
  });

  it("returns active status for running job", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user-1" } });
    mockQueueGetJob.mockResolvedValue({ id: "job-1" });
    mockJobGetState.mockResolvedValue("active");

    const { analyzeGet } = await importRoutes();
    const req = createRequest({ searchParams: { jobId: "job-1" } });
    const res = await analyzeGet(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe("active");
  });

  it("returns completed status for finished job", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user-1" } });
    mockQueueGetJob.mockResolvedValue({ id: "job-1" });
    mockJobGetState.mockResolvedValue("completed");

    const { analyzeGet } = await importRoutes();
    const req = createRequest({ searchParams: { jobId: "job-1" } });
    const res = await analyzeGet(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe("completed");
  });

  it("returns failed status with reason", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user-1" } });
    mockQueueGetJob.mockResolvedValue({
      id: "job-1",
      failedReason: "No channels found for this niche.",
    });
    mockJobGetState.mockResolvedValue("failed");

    const { analyzeGet } = await importRoutes();
    const req = createRequest({ searchParams: { jobId: "job-1" } });
    const res = await analyzeGet(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe("failed");
    expect(body.failedReason).toBe("No channels found for this niche.");
  });

  it("returns not-found for unknown jobId", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user-1" } });
    mockQueueGetJob.mockResolvedValue(null);

    const { analyzeGet } = await importRoutes();
    const req = createRequest({ searchParams: { jobId: "nonexistent" } });
    const res = await analyzeGet(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe("not-found");
  });
});
