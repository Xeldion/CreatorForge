import OpenAI from "openai";

/**
 * Singleton OpenAI client.
 *
 * Configured server-side only. Never expose the API key to the client.
 */

const globalForOpenAI = globalThis as unknown as {
  openai: OpenAI | undefined;
};

export const openai =
  globalForOpenAI.openai ??
  new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

if (process.env.NODE_ENV !== "production") {
  globalForOpenAI.openai = openai;
}

// ============================================================================
// Typed LLM helpers
// ============================================================================

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export interface LLMCallOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  responseFormat?: "text" | "json_object";
}

/**
 * Simple chat completion wrapper with sensible defaults.
 */
export async function chat(
  messages: ChatMessage[],
  options: LLMCallOptions = {}
): Promise<string> {
  const response = await openai.chat.completions.create({
    model: options.model ?? "gpt-4o",
    temperature: options.temperature ?? 0.7,
    max_tokens: options.maxTokens,
    messages,
    ...(options.responseFormat === "json_object"
      ? { response_format: { type: "json_object" } }
      : {}),
  });

  return response.choices[0]?.message?.content ?? "";
}

/**
 * Chat with structured JSON output — validates against a Zod schema.
 */
export async function chatStructured<T>(
  messages: ChatMessage[],
  schema: { parse: (data: unknown) => T },
  options: LLMCallOptions = {}
): Promise<T> {
  const text = await chat(messages, {
    ...options,
    responseFormat: "json_object",
  });

  try {
    return schema.parse(JSON.parse(text));
  } catch (error) {
    throw new Error(
      `LLM returned invalid JSON. Raw response: ${text.slice(0, 200)}...`
    );
  }
}

/**
 * Analyze images with GPT-4 Vision.
 * Used for thumbnail winner analysis.
 */
export async function analyzeImages(
  prompt: string,
  imageUrls: string[],
  options: { model?: string; maxTokens?: number } = {}
): Promise<string> {
  const response = await openai.chat.completions.create({
    model: options.model ?? "gpt-4o",
    max_tokens: options.maxTokens ?? 1000,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          ...imageUrls.map((url) => ({
            type: "image_url" as const,
            image_url: { url, detail: "high" as const },
          })),
        ],
      },
    ],
  });

  return response.choices[0]?.message?.content ?? "";
}
