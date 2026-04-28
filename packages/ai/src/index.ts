import OpenAI from "openai";

/**
 * LLM client singleton — provider-agnostic via OpenAI-compatible API.
 *
 * Set one of these in .env.local:
 *   OPENAI_API_KEY — uses api.openai.com
 *   DEEPSEEK_API_KEY — uses api.deepseek.com
 *
 * Priority: DEEPSEEK_API_KEY > OPENAI_API_KEY
 */
const globalForOpenAI = globalThis as unknown as {
  openai: OpenAI | undefined;
};

function createClient(): OpenAI {
  const deepseekKey = process.env.DEEPSEEK_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (deepseekKey) {
    return new OpenAI({
      apiKey: deepseekKey,
      baseURL: "https://api.deepseek.com/v1",
    });
  }

  if (openaiKey) {
    return new OpenAI({ apiKey: openaiKey });
  }

  // Return a client anyway — it'll throw a clear error on first use
  return new OpenAI({ apiKey: "MISSING_API_KEY" });
}

export const openai =
  globalForOpenAI.openai ?? createClient();

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

/** Default model based on which provider is configured */
function defaultModel(): string {
  if (process.env.DEEPSEEK_API_KEY) return "deepseek-chat";
  return "gpt-4o";
}

/** DeepSeek supports json_object but not max_tokens */
function provider() {
  return process.env.DEEPSEEK_API_KEY ? "deepseek" : "openai";
}

/**
 * Simple chat completion wrapper with sensible defaults.
 */
export async function chat(
  messages: ChatMessage[],
  options: LLMCallOptions = {}
): Promise<string> {
  // DeepSeek requires the word "json" in the prompt for json_object mode
  if (options.responseFormat === "json_object" && provider() === "deepseek") {
    const last = messages[messages.length - 1];
    if (last) {
      last.content += "\n\nRespond with valid JSON.";
    }
  }

  const response = await openai.chat.completions.create({
    model: options.model ?? defaultModel(),
    temperature: options.temperature ?? 0.7,
    max_tokens: options.maxTokens,
    messages: messages,
    ...(options.responseFormat === "json_object"
      ? { response_format: { type: "json_object" as const } }
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

  // Strip markdown code blocks if present (LLMs often wrap JSON in ```json ... ```)
  let cleanText = text.trim();
  const codeBlockMatch = cleanText.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (codeBlockMatch) {
    cleanText = codeBlockMatch[1].trim();
  }

  try {
    return schema.parse(JSON.parse(cleanText));
  } catch (error) {
    throw new Error(
      `LLM returned invalid JSON. Raw response: ${text.slice(0, 300)}...`
    );
  }
}

/**
 * Analyze images with vision-capable model.
 * DeepSeek doesn't support vision — falls back to text-only analysis.
 */
export async function analyzeImages(
  prompt: string,
  imageUrls: string[],
  options: { model?: string; maxTokens?: number } = {}
): Promise<string> {
  const isDeepSeek = provider() === "deepseek";

  if (isDeepSeek) {
    // DeepSeek doesn't have vision — return a text-only analysis
    return chat(
      [
        {
          role: "system",
          content:
            "You are analyzing YouTube thumbnails based on their descriptions. Provide detailed visual analysis.",
        },
        {
          role: "user",
          content: `${prompt}\n\n(Note: images are at these URLs but vision analysis is unavailable: ${imageUrls.join(", ")})`,
        },
      ],
      { maxTokens: options.maxTokens ?? 1000 }
    );
  }

  // OpenAI GPT-4 Vision
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
