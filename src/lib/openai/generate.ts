import OpenAI from "openai";

import type { EditableZones } from "@/lib/template/types";
import { getEnv } from "@/lib/env";
import { AiGenerationSchema, type AiGeneration, type GenerateRequest } from "@/lib/schema";

let client: OpenAI | null = null;
const MAX_MODEL_ATTEMPTS = 2;
const RETRY_DELAYS_MS = [700, 1500];

const DESIGN_QUALITY_RULES = [
  "Establish one clear visual direction and apply it consistently.",
  "Create strong hierarchy through typography scale, spacing rhythm, and section contrast.",
  "Keep long-form reading comfortable (body size around 16px+, robust line-height, clear paragraph spacing).",
  "Use high-contrast palette choices so text/action controls remain legible.",
  "Style interactive states for links and buttons, including :focus-visible states.",
  "Tune responsive behavior for desktop and mobile without flattening hierarchy.",
];

const TUMBLR_THEME_RULES = [
  "Preserve readability of post content, metadata, tags, and reblog trails.",
  "Keep navigation, pagination, and post actions visually obvious.",
  "Do not add external runtime dependencies.",
  "Do not remove or break Tumblr template variables/blocks in editable regions.",
];

interface DirectionProfile {
  name: string;
  palette: string;
  typography: string;
  components: string;
  motion: string;
}

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

function selectDirectionProfile(request: GenerateRequest): DirectionProfile {
  const source = `${request.themeName} ${request.structured.tone} ${request.structured.paletteHint} ${request.prompt}`.toLowerCase();

  if (hasAnyKeyword(source, ["neo brutal", "neo-brutal", "brutal", "brutalism"])) {
    return {
      name: "Neo Brutalist",
      palette: "High-contrast primaries with bold accent blocks and strong border separation.",
      typography: "Heavy, assertive headings paired with highly readable body text.",
      components: "Hard-edged cards, thick outlines, offset shadows, loud action buttons, visible chips/tags.",
      motion: "Minimal but punchy transitions; avoid subtle/soft styling.",
    };
  }

  if (hasAnyKeyword(source, ["editorial", "magazine", "serif", "literary"])) {
    return {
      name: "Editorial",
      palette: "Refined neutral surfaces with one restrained accent.",
      typography: "Expressive serif headlines with balanced body rhythm and metadata contrast.",
      components: "Clean modules, elegant rules/dividers, strong spacing cadence and post legibility.",
      motion: "Gentle, low-amplitude transitions that support reading flow.",
    };
  }

  if (hasAnyKeyword(source, ["cyber", "tech", "terminal", "futur", "digital"])) {
    return {
      name: "Tech Grid",
      palette: "Cool or dark-leaning surfaces with luminous accent tones and clear state colors.",
      typography: "Structured headline scale with compact utility/meta type treatment.",
      components: "Grid-forward cards, data-like chips, precise controls, strong media framing.",
      motion: "Crisp motion and transforms with reduced-motion-safe fallback.",
    };
  }

  if (hasAnyKeyword(source, ["playful", "fun", "cute", "pastel", "collage"])) {
    return {
      name: "Playful Collage",
      palette: "Layered warm/cool palette with strong contrast anchors.",
      typography: "Expressive display headings with simple, legible body text.",
      components: "Layered surfaces, badge-like tags, vibrant controls, varied module emphasis.",
      motion: "Lively motion for reveals/hover while preserving usability.",
    };
  }

  return {
    name: "Modern Content-First",
    palette: "Balanced base neutrals with a focused accent and clear surface separation.",
    typography: "Readable body-first system with a distinct heading voice.",
    components: "Confident cards/modules, polished action controls, and clear post metadata hierarchy.",
    motion: "Subtle transitions that improve affordance without distraction.",
  };
}

function buildSystemPrompt(reducedScope: boolean): string {
  return [
    "You are Themblr, an AI art director and front-end engineer editing a Tumblr starter theme.",
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
    "Deliver a polished, clearly distinct result from the starter theme.",
    "Prioritize high-impact styling changes in tokens, hierarchy, spacing, cards, metadata readability, controls, and typography.",
    "Quality rules:",
    ...DESIGN_QUALITY_RULES.map((rule, index) => `${index + 1}. ${rule}`),
    "Tumblr rules:",
    ...TUMBLR_THEME_RULES.map((rule, index) => `${index + 1}. ${rule}`),
    "Never return prose outside JSON.",
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

  const cssForPrompt = truncateForPrompt(baseEditableZones.cssCore, 12000);
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
    `Art direction: ${direction.name}`,
    `Direction palette: ${direction.palette}`,
    `Direction typography: ${direction.typography}`,
    `Direction components: ${direction.components}`,
    `Direction motion: ${direction.motion}`,
    `Layout: ${request.structured.layout}`,
    `Post width: ${request.structured.postWidth}`,
    `Card style: ${request.structured.cardStyle}`,
    `Header alignment: ${request.structured.headerAlignment}`,
    `Notes avatar size: ${request.structured.notesAvatarSize}`,
    `Toggles: ${JSON.stringify(request.structured.toggles)}`,
    `Creative prompt: ${request.prompt}`,
    "Distinctness requirement: final look must be noticeably different from Default Era at first glance.",
    "Mandatory transformation checklist:",
    "1. Replace token defaults for background/surfaces/text/accent/border with a coherent palette.",
    "2. Define visible type hierarchy for h1/h2/h3/body/meta and clear spacing rhythm.",
    "3. Restyle at least five component groups: header/nav, post cards, post meta/actions, tags/chips, pagination, sidebar modules, footer.",
    "4. Include hover and focus-visible styling for links/buttons.",
    "5. Provide responsive tuning for 1100px, 780px, and 540px breakpoints.",
    "6. Avoid superficial changes; do not return tiny cosmetic edits.",
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
          temperature: 0.85,
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
