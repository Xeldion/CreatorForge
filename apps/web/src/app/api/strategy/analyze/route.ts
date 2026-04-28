/**
 * POST /api/strategy/analyze — Enqueue content gap analysis job
 *
 * Accepts a niche string and kicks off the full content gap pipeline
 * as a BullMQ background job. Returns a jobId for polling.
 */

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { contentGapQueue, getJobStatus } from "@/lib/queue";
import { NextResponse } from "next/server";
import { z } from "zod";

const requestSchema = z.object({
  niche: z.string().min(3, "Niche must be at least 3 characters").max(100),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = (session.user as { id: string }).id;

  // Parse and validate input
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const { niche } = parsed.data;

  // Get the user's Google refresh token
  const account = await prisma.account.findFirst({
    where: { userId, provider: "google" },
    select: { refresh_token: true },
  });

  if (!account?.refresh_token) {
    return NextResponse.json(
      { error: "No YouTube account connected. Please re-connect your account." },
      { status: 400 }
    );
  }

  // Enqueue the background job
  const job = await contentGapQueue.add("analyze", {
    userId,
    niche: niche.trim(),
    refreshToken: account.refresh_token,
  });

  return NextResponse.json({
    jobId: job.id,
    message: "Content gap analysis started. This takes ~45-60 seconds.",
  });
}

/**
 * GET /api/strategy/analyze — Check job status
 *
 * Pass ?jobId= to poll for completion.
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const jobId = searchParams.get("jobId");

  if (!jobId) {
    return NextResponse.json(
      { error: "?jobId= parameter is required" },
      { status: 400 }
    );
  }

  const status = await getJobStatus("content-gap", jobId);

  return NextResponse.json(status);
}
