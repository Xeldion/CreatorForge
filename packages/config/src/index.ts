import { z } from "zod";

/**
 * Environment variable schema.
 *
 * All env vars are validated at startup. If validation fails, the app crashes
 * with a descriptive error instead of failing silently at runtime.
 *
 * ⚠️  NEVER access process.env directly. Always use this validated config.
 */

export const envSchema = z.object({
  // Database
  DATABASE_URL: z.string().url("DATABASE_URL must be a valid PostgreSQL connection string"),

  // Auth (NextAuth)
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters"),
  AUTH_GOOGLE_ID: z.string().min(1, "AUTH_GOOGLE_ID is required"),
  AUTH_GOOGLE_SECRET: z.string().min(1, "AUTH_GOOGLE_SECRET is required"),

  // YouTube API
  YOUTUBE_API_KEY: z.string().min(1, "YOUTUBE_API_KEY is required"),
  YOUTUBE_CLIENT_ID: z.string().min(1, "YOUTUBE_CLIENT_ID is required"),
  YOUTUBE_CLIENT_SECRET: z.string().min(1, "YOUTUBE_CLIENT_SECRET is required"),

  // Redis
  REDIS_URL: z.string().url("REDIS_URL must be a valid Redis connection string"),

  // OpenAI
  OPENAI_API_KEY: z.string().startsWith("sk-", "OPENAI_API_KEY must start with 'sk-'"),

  // Cloudflare R2
  R2_ACCOUNT_ID: z.string().min(1, "R2_ACCOUNT_ID is required"),
  R2_ACCESS_KEY_ID: z.string().min(1, "R2_ACCESS_KEY_ID is required"),
  R2_SECRET_ACCESS_KEY: z.string().min(1, "R2_SECRET_ACCESS_KEY is required"),
  R2_BUCKET_NAME: z.string().min(1, "R2_BUCKET_NAME is required"),
  R2_PUBLIC_URL: z.string().url("R2_PUBLIC_URL must be a valid URL").optional(),

  // Replicate (thumbnail generation)
  REPLICATE_API_TOKEN: z.string().optional(),

  // App
  NEXT_PUBLIC_APP_URL: z.string().url("NEXT_PUBLIC_APP_URL must be a valid URL"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

  // Email (Resend)
  RESEND_API_KEY: z.string().optional(),

  // Stripe
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().optional(),

  // Sentry (error monitoring)
  SENTRY_DSN: z.string().url().optional(),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Validate and parse environment variables.
 * Call once at app startup. Crashes on invalid config.
 */
export function parseEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const errors = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");

    console.error(
      `❌ Invalid environment variables:\n${errors}\n\n` +
        `Fix these and restart. See .env.example for required values.`
    );
    process.exit(1);
  }

  return result.data;
}

// Singleton — parsed once, reused everywhere
let _env: Env | null = null;

export function env(): Env {
  if (!_env) {
    _env = parseEnv();
  }
  return _env;
}
