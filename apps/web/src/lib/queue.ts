import { Queue } from "bullmq";
import { redis } from "./redis";

/**
 * BullMQ queue instances for enqueuing background jobs from API routes.
 *
 * These are "producer" connections — they only enqueue jobs.
 * The actual processing happens in apps/workers.
 *
 * Usage in an API route:
 *   import { contentGapQueue } from "@/lib/queue";
 *   const job = await contentGapQueue.add("analyze", { userId, niche, refreshToken });
 *   return NextResponse.json({ jobId: job.id });
 */

const connection = redis;

export const contentGapQueue = new Queue("content-gap", {
  connection,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: { age: 7 * 24 * 3600 }, // Keep completed jobs for 7 days
    removeOnFail: { age: 30 * 24 * 3600 },    // Keep failed jobs for 30 days
  },
});

export const abTestQueue = new Queue("ab-test", {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "fixed", delay: 10000 },
    removeOnComplete: { age: 24 * 3600 },
    removeOnFail: { age: 7 * 24 * 3600 },
  },
});

/**
 * Get the status of a job by ID.
 * Used by the frontend to poll for completion.
 */
export async function getJobStatus(queueName: string, jobId: string) {
  const queue = queueName === "content-gap" ? contentGapQueue : abTestQueue;
  const job = await queue.getJob(jobId);

  if (!job) return { status: "not-found" as const };

  const state = await job.getState();

  return {
    status: state,
    progress: job.progress,
    result: job.returnvalue ?? null,
    failedReason: job.failedReason ?? null,
  };
}
