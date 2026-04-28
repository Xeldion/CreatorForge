/**
 * BullMQ Worker Runner
 *
 * Starts all background workers. Each worker type runs in its own process
 * and handles one job type. Workers are designed to run independently —
 * they can be deployed as separate services or bundled together.
 *
 * Usage:
 *   npm run dev                    # Run all workers
 *   npm run dev -- content-gap     # Run only content gap worker
 *   npm run dev -- ab-test         # Run only A/B test worker
 *
 * In production, each worker runs as a separate Railway/container instance.
 */

import { config } from "dotenv";
config({ path: ".env.local" });
import { Worker } from "bullmq";

async function main() {
  const { contentGapProcessor } = await import("./workers/content-gap.js");
  const { abTestProcessor } = await import("./workers/ab-test.js");

  const WORKERS = {
    "content-gap": contentGapProcessor,
    "ab-test": abTestProcessor,
  } as const;

  type WorkerName = keyof typeof WORKERS;

  const targetWorker = process.argv[2] as WorkerName | undefined;

  if (targetWorker && !(targetWorker in WORKERS)) {
    console.error(`Unknown worker: ${targetWorker}`);
    console.error(`Available workers: ${Object.keys(WORKERS).join(", ")}`);
    process.exit(1);
  }

  const workersToStart = targetWorker
    ? ([targetWorker] as WorkerName[])
    : (Object.keys(WORKERS) as WorkerName[]);

  console.info(
    `Starting workers: ${workersToStart.join(", ")} (Redis: ${process.env.REDIS_URL?.slice(0, 20)}...)`
  );

  for (const name of workersToStart) {
    const worker = new Worker(name, WORKERS[name]!, {
      connection: {
        url: process.env.REDIS_URL!,
        tls: {},
      },
      concurrency: name === "content-gap" ? 1 : 3,
    });

    worker.on("completed", (job) => {
      console.info(`[${name}] Job ${job.id} completed`);
    });

    worker.on("failed", (job, err) => {
      console.error(`[${name}] Job ${job?.id} failed:`, err.message);
    });

    console.info(`[${name}] Worker started (queue: ${name})`);
  }

  // Graceful shutdown
  const shutdown = async () => {
    console.info("\nShutting down workers...");
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("Worker startup failed:", err);
  process.exit(1);
});
