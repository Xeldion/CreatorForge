import { PrismaClient } from "@prisma/client";

/**
 * Singleton Prisma client.
 *
 * Avoids creating multiple PrismaClient instances in development
 * (Next.js hot reload can cause connection pool exhaustion).
 *
 * Usage:
 *   import { prisma } from "@creatorforge/database";
 */

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "warn", "error"]
        : ["warn", "error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
