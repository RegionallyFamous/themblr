import OpenAI from "openai";

import type { EditableZones } from "@/lib/template/types";
import { getEnv } from "@/lib/env";
import { AiGenerationSchema, type AiGeneration, type GenerateRequest } from "@/lib/schema";

let client: OpenAI | null = null;
const MAX_MODEL_ATTEMPTS = 2;
const RETRY_DELAYS_MS = [700, 1500];

function getClient(): OpenAI {
  const env = getEnv();
  if (!env.openAiApiKey) {
    throw new Error("OPENAI_API_KEY is missing");
  }

  if (!client) {
    client = new OpenAI({ apiKey: env.openAiApiKey });
  }

  return client;
}

export interface AiGenerateOptions {
  request: GenerateRequest;
  baseEditableZones: EditableZones;
  violations?: string[];
  reducedScope?: boolean;
  timeoutMs: number;
}

function hasAnyKeyword(source: string, keywords: string[]): boolean {
  return keywords.some((keyword) => source.includes(keyword));
}

function selectDirectionProfile(request: GenerateRequest): string {
  const source = `${request.themeName} ${request.structured.tone} ${request.structured.paletteHint} ${request.prompt}`.toLowerCase();

  if (hasAnyKeyword(source, ["neo brutal", "neo-brutal", "brutal", "brutalism"])) {
    return "Neo Brutalist: hard edges, thick borders, assertive type, high contrast.";
  }

  if (hasAnyKeyword(source, ["editorial", "magazine", "serif", "literary"])) {
    return "Editorial: refined contrast, clean modules, strong reading rhythm.";
  }

  if (hasAnyKeyword(source, ["cyber", "tech", "terminal", "futur", "digital"])) {
    return "Tech Grid: precise layout, crisp controls, luminous accent on restrained surfaces.";
  }

  if (hasAnyKeyword(source, ["playful", "fun", "cute", "pastel", "collage"])) {
    return "Playful Collage: layered color, expressive headings, energetic accents.";
  }

  return "Modern Content-First: strong readability, clear hierarchy, confident components.";
}

function buildSystemPrompt(reducedScope: boolean): string {
  return [
    "You are Themblr, a Tumblr theme style generator.",
    "Return strict JSON only.",
    "Output exactly this shape:",
    "{\"editableZones\":{\"cssCore\":string?,\"headerSection\":string?,\"sidebarSection\":string?,\"contextSection\":string?},\"metaDefaults\":Record<string,string>,\"notes\":string[]}",
    reducedScope
      ? "CSS-only mode: return ONLY editableZones.cssCore and optional metaDefaults."
      : "You may return cssCore, headerSection, sidebarSection, and contextSection edits.",
    "Do not output full HTML or full base CSS.",
    "Do not include external dependencies.",
    "cssCore must be an additive override patch between 700 and 2800 characters.",
    "Include :root overrides for --t-bg, --t-surface, --t-text, --t-muted, --t-accent, --t-border, --t-radius, --t-gap, --t-max-post.",
    "Include visible styling for .site-header, .post-card, .post-meta, .post-actions a, .pagination, and .theme-module.",
    "Include hover and :focus-visible states.",
    "Include media queries for 1100px, 780px, and 540px.",
    "Do not return markdown fences or prose.",
  ].join("\n");
}

function truncateForPrompt(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }

  const headChars = Math.floor(maxChars * 0.72);
  const tailChars = Math.max(0, maxChars - headChars);
  return `${value.slice(0, headChars)}\n... [middle truncated ${value.length - maxChars} chars] ...\n${value.slice(
    value.length - tailChars,
  )}`;
}

function buildUserPrompt(options: AiGenerateOptions): string {
  const { request, baseEditableZones, violations, reducedScope } = options;
  const direction = selectDirectionProfile(request);

  const cssForPrompt = truncateForPrompt(baseEditableZones.cssCore, 2600);

  const zoneSections = [
    "Base CSS excerpt (for selector context only):",
    `<cssCore>\n${cssForPrompt}\n</cssCore>`,
  ];

  return [
    `Theme name: ${request.themeName}`,
    `Art direction: ${direction}`,
    `Tone hint: ${request.structured.tone}`,
    `Palette hint: ${request.structured.paletteHint}`,
    `Layout hint: ${request.structured.layout}, ${request.structured.postWidth}, ${request.structured.cardStyle}`,
    `Creative prompt: ${request.prompt}`,
    reducedScope ? "Scope: cssCore + metaDefaults only." : "Scope: full editable zones.",
    violations?.length ? `Prior validation violations: ${violations.join(" | ")}` : "Prior validation violations: none",
    "Output compact overrides only. Do not restate unchanged base rules.",
    ...zoneSections,
  ].join("\n\n");
}

function getErrorStatus(error: unknown): number | null {
  if (error && typeof error === "object") {
    const status = (error as { status?: unknown }).status;
    if (typeof status === "number") {
      return status;
    }
  }

  return null;
}

function isRetryableOpenAiError(error: unknown): boolean {
  const status = getErrorStatus(error);
  return typeof status === "number" && status >= 500;
}

function timeoutError(message: string): Error {
  const err = new Error(message);
  err.name = "AbortError";
  return err;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestOpenAiJsonForModel(
  openai: OpenAI,
  model: string,
  options: AiGenerateOptions,
  deadlineAt: number,
): Promise<string> {
  for (let attempt = 0; attempt < MAX_MODEL_ATTEMPTS; attempt += 1) {
    const remainingMs = deadlineAt - Date.now();
    if (remainingMs <= 250) {
      throw timeoutError("Generation timed out before OpenAI request");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), remainingMs);

    try {
      const completion = await openai.chat.completions.create(
        {
          model,
          temperature: 0.6,
          max_completion_tokens: 2200,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content: buildSystemPrompt(Boolean(options.reducedScope)),
            },
            {
              role: "user",
              content: buildUserPrompt(options),
            },
          ],
        },
        { signal: controller.signal },
      );

      const raw = completion.choices[0]?.message?.content;
      if (!raw) {
        throw new Error("OpenAI returned empty content");
      }

      return raw;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw timeoutError("Generation timed out while waiting for OpenAI");
      }

      const status = getErrorStatus(error);
      if (status === 429) {
        throw error;
      }

      if (isRetryableOpenAiError(error) && attempt < MAX_MODEL_ATTEMPTS - 1) {
        const remaining = deadlineAt - Date.now();
        if (remaining <= 350) {
          throw timeoutError("Generation timed out during retry backoff");
        }

        const retryDelay = Math.min(RETRY_DELAYS_MS[attempt] ?? 800, Math.max(150, remaining - 250));
        await sleep(retryDelay);
        continue;
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error("OpenAI request failed after retries");
}

function parseLenientJson(raw: string): unknown {
  const trimmed = raw.trim();
  const candidates: string[] = [trimmed];

  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced?.[1]) {
    candidates.push(fenced[1].trim());
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(trimmed.slice(firstBrace, lastBrace + 1));
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      continue;
    }
  }

  throw new Error("OpenAI returned non-JSON output");
}

export async function generateEditableOverridesWithOpenAI(options: AiGenerateOptions): Promise<AiGeneration> {
  const env = getEnv();
  if (!env.openAiModel) {
    throw new Error("OPENAI_MODEL is missing");
  }

  const openai = getClient();
  const deadlineAt = Date.now() + options.timeoutMs;
  const fallbackModel = env.openAiFallbackModel.trim();

  let raw: string;
  try {
    raw = await requestOpenAiJsonForModel(openai, env.openAiModel, options, deadlineAt);
  } catch (error) {
    const status = getErrorStatus(error);
    const canFallback = Boolean(fallbackModel) && fallbackModel !== env.openAiModel;

    if (status === 429 && canFallback) {
      raw = await requestOpenAiJsonForModel(openai, fallbackModel, options, deadlineAt);
    } else {
      throw error;
    }
  }

  const parsed = parseLenientJson(raw);

  return AiGenerationSchema.parse(parsed);
}
