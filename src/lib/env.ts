import { DEFAULT_ENV } from "@/lib/contracts";

function readInt(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

export function getEnv() {
  return {
    openAiApiKey: process.env.OPENAI_API_KEY ?? "",
    openAiModel: process.env.OPENAI_MODEL ?? "",
    starterThemePath: process.env.STARTER_THEME_PATH,
    rateLimitWindowMs: readInt(process.env.RATE_LIMIT_WINDOW_MS, DEFAULT_ENV.RATE_LIMIT_WINDOW_MS),
    rateLimitMax: readInt(process.env.RATE_LIMIT_MAX, DEFAULT_ENV.RATE_LIMIT_MAX),
    generationTimeoutMs: readInt(process.env.GENERATION_TIMEOUT_MS, DEFAULT_ENV.GENERATION_TIMEOUT_MS),
    maxPromptChars: readInt(process.env.MAX_PROMPT_CHARS, DEFAULT_ENV.MAX_PROMPT_CHARS),
    maxRequestBytes: readInt(process.env.MAX_REQUEST_BYTES, DEFAULT_ENV.MAX_REQUEST_BYTES),
    nodeEnv: process.env.NODE_ENV ?? "development",
  };
}
