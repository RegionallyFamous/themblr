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

function buildSystemPrompt(reducedScope: boolean): string {
  return [
    "You are Themblr, an AI code assistant that edits a Tumblr starter theme.",
    "Return strict JSON only.",
    "Never modify locked core post rendering behavior.",
    "Output ONLY this shape:",
    "{\"editableZones\":{\"cssCore\":string?,\"headerSection\":string?,\"sidebarSection\":string?,\"contextSection\":string?},\"metaDefaults\":Record<string,string>,\"notes\":string[]}",
    reducedScope
      ? "Reduced scope is active: only return cssCore and metaDefaults, do not return headerSection/sidebarSection/contextSection."
      : "You may return cssCore, headerSection, sidebarSection, and contextSection edits.",
    "Keep Tumblr tags, blocks, and variables untouched unless they are already in editable sections.",
    "Do not add external dependencies (no external script src, no external CSS/font cdns).",
    "Preserve {CustomCSS} marker expectation by not outputting it in cssCore.",
    "Favor concise output. Keep cssCore compact and avoid rewriting unrelated sections.",
  ].join("\n");
}

function truncateForPrompt(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }

  return `${value.slice(0, maxChars)}\n... [truncated ${value.length - maxChars} chars]`;
}

function buildUserPrompt(options: AiGenerateOptions): string {
  const { request, baseEditableZones, violations, reducedScope } = options;

  const cssForPrompt = truncateForPrompt(baseEditableZones.cssCore, 5000);
  const headerForPrompt = truncateForPrompt(baseEditableZones.headerSection, 1800);
  const sidebarForPrompt = truncateForPrompt(baseEditableZones.sidebarSection, 1800);
  const contextForPrompt = truncateForPrompt(baseEditableZones.contextSection, 1800);

  const zoneSections = [
    "Base editable zones (truncated for latency; maintain contracts):",
    `<cssCore>\n${cssForPrompt}\n</cssCore>`,
  ];

  if (!reducedScope) {
    zoneSections.push(
      `<headerSection>\n${headerForPrompt}\n</headerSection>`,
      `<sidebarSection>\n${sidebarForPrompt}\n</sidebarSection>`,
      `<contextSection>\n${contextForPrompt}\n</contextSection>`,
    );
  }

  return [
    `Theme name: ${request.themeName}`,
    `Slug: ${request.slug}`,
    `Tone: ${request.structured.tone}`,
    `Palette hint: ${request.structured.paletteHint}`,
    `Layout: ${request.structured.layout}`,
    `Post width: ${request.structured.postWidth}`,
    `Card style: ${request.structured.cardStyle}`,
    `Header alignment: ${request.structured.headerAlignment}`,
    `Notes avatar size: ${request.structured.notesAvatarSize}`,
    `Toggles: ${JSON.stringify(request.structured.toggles)}`,
    `Creative prompt: ${request.prompt}`,
    reducedScope ? "Reduced scope: true" : "Reduced scope: false",
    violations?.length ? `Prior validation violations: ${violations.join(" | ")}` : "Prior validation violations: none",
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
          temperature: 0.7,
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

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("OpenAI returned non-JSON output");
  }

  return AiGenerationSchema.parse(parsed);
}
