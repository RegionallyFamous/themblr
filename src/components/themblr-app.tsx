"use client";

import { useEffect, useMemo, useState } from "react";

import {
  GenerateResponseSchema,
  type GenerateRequest,
  type GenerateResponse,
} from "@/lib/schema";
import { buildFakeTumblrPreviewHtml } from "@/lib/preview/fake-tumblr";
import { normalizeSlug } from "@/lib/utils";

const defaultRequest: GenerateRequest = {
  themeName: "Default Era",
  slug: "default-era",
  structured: decideStructured("Default Era", "Build a solid starter Tumblr theme with clear hierarchy."),
  prompt: "Create a distinct Tumblr theme with strong hierarchy, good readability, and a clear visual identity.",
};

type GenerateStage = "idle" | "preparing" | "requesting" | "validating" | "finalizing";

const stageLabel: Record<GenerateStage, string> = {
  idle: "",
  preparing: "Preparing prompt and structured config",
  requesting: "Generating design with AI model",
  validating: "Running contract and safety validation",
  finalizing: "Finalizing output and preview",
};

function downloadText(filename: string, content: string, mimeType = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function keywordMatch(input: string, keywords: string[]): boolean {
  return keywords.some((keyword) => input.includes(keyword));
}

function progressPercent(stage: GenerateStage, elapsedMs: number): number {
  if (stage === "preparing") {
    return 8;
  }

  if (stage === "requesting") {
    return Math.min(82, 18 + Math.floor(elapsedMs / 1400));
  }

  if (stage === "validating") {
    return 90;
  }

  if (stage === "finalizing") {
    return 97;
  }

  return 0;
}

function decideStructured(themeName: string, prompt: string): GenerateRequest["structured"] {
  const raw = `${themeName} ${prompt}`.toLowerCase();

  const layout =
    keywordMatch(raw, ["grid", "gallery", "masonry", "catalog"]) ? "grid" : keywordMatch(raw, ["split", "sidebar", "two-column", "magazine"]) ? "split" : "stream";

  const postWidth =
    keywordMatch(raw, ["compact", "dense", "tight"]) ? "compact" : keywordMatch(raw, ["wide", "spacious", "cinematic"]) ? "wide" : "regular";

  const cardStyle =
    keywordMatch(raw, ["minimal", "clean", "bare"]) ? "minimal" : keywordMatch(raw, ["elevated", "shadow", "layered"]) ? "elevated" : "outlined";
  const headerAlignment = keywordMatch(raw, ["center", "centered"]) ? "center" : "left";
  const notesAvatarSize = keywordMatch(raw, ["large avatar", "big avatar", "avatar-forward"]) ? "large" : "small";
  const enableMotion = !keywordMatch(raw, ["no motion", "static", "reduced motion"]);

  let paletteHint = "Balanced palette with one clear accent";
  if (keywordMatch(raw, ["mono", "monochrome", "black and white"])) {
    paletteHint = "Monochrome palette with a single accent";
  } else if (keywordMatch(raw, ["warm", "sunset", "earthy"])) {
    paletteHint = "Warm palette with a bright accent";
  } else if (keywordMatch(raw, ["cool", "ocean", "cyber"])) {
    paletteHint = "Cool palette with high-clarity accents";
  }

  return {
    layout,
    postWidth,
    cardStyle,
    headerAlignment,
    notesAvatarSize,
    toggles: {
      showSidebar: true,
      showSearch: true,
      showFeaturedTags: true,
      showFollowing: false,
      showLikesWidget: false,
      showRelatedPosts: true,
      showFooter: true,
      enableMotion,
    },
    tone: prompt.trim().slice(0, 120) || "Clean, thoughtful, and editorial",
    paletteHint,
  };
}

interface ThemblrAppProps {
  initialThemeHtml?: string;
}

export function ThemblrApp({ initialThemeHtml = "" }: ThemblrAppProps) {
  const [requestState, setRequestState] = useState<GenerateRequest>(defaultRequest);
  const [result, setResult] = useState<GenerateResponse | null>(null);
  const [outputView, setOutputView] = useState<"preview" | "code">("preview");
  const [error, setError] = useState<string>("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateStage, setGenerateStage] = useState<GenerateStage>("idle");
  const [generationStartMs, setGenerationStartMs] = useState<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [lastDurationMs, setLastDurationMs] = useState<number | null>(null);

  useEffect(() => {
    if (!isGenerating || generationStartMs === null) {
      setElapsedMs(0);
      return;
    }

    const timer = window.setInterval(() => {
      setElapsedMs(Date.now() - generationStartMs);
    }, 250);

    return () => {
      window.clearInterval(timer);
    };
  }, [isGenerating, generationStartMs]);

  async function runGenerate() {
    const startedAt = Date.now();
    setIsGenerating(true);
    setGenerateStage("preparing");
    setGenerationStartMs(startedAt);
    setLastDurationMs(null);
    setError("");

    try {
      const themeName = requestState.themeName.trim() || "Default Era";
      const prompt = requestState.prompt.trim() || defaultRequest.prompt;
      const payload: GenerateRequest = {
        ...requestState,
        themeName,
        slug: normalizeSlug(themeName) || "default-era",
        structured: decideStructured(themeName, prompt),
        prompt,
      };

      setRequestState(payload);
      setGenerateStage("requesting");

      const response = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const requestId =
        response.headers && typeof response.headers.get === "function"
          ? response.headers.get("x-request-id")
          : null;
      const rawBody =
        typeof (response as { text?: unknown }).text === "function"
          ? await response.text()
          : JSON.stringify(await response.json());
      let responsePayload: unknown;

      try {
        responsePayload = rawBody ? JSON.parse(rawBody) : null;
      } catch {
        responsePayload = null;
      }

      setGenerateStage("validating");

      const hasValidationPayload =
        responsePayload !== null &&
        typeof responsePayload === "object" &&
        Object.prototype.hasOwnProperty.call(responsePayload, "validation");

      if (!response.ok && !hasValidationPayload) {
        const payloadError =
          responsePayload && typeof responsePayload === "object" && "error" in responsePayload
            ? (responsePayload as { error?: unknown }).error
            : undefined;
        const message =
          typeof payloadError === "string" && payloadError.trim().length > 0
            ? payloadError
            : `Generation failed with HTTP ${response.status}`;

        throw new Error(requestId ? `${message} (request: ${requestId})` : message);
      }

      const parsed = GenerateResponseSchema.parse(responsePayload);
      setGenerateStage("finalizing");
      setResult(parsed);
      setOutputView("preview");
      setLastDurationMs(Date.now() - startedAt);
    } catch (err) {
      setResult(null);
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setIsGenerating(false);
      setGenerateStage("idle");
      setGenerationStartMs(null);
    }
  }

  const previewSourceThemeHtml = result?.themeHtml || initialThemeHtml;
  const previewHtml = useMemo(() => {
    if (!previewSourceThemeHtml) {
      return "";
    }

    return buildFakeTumblrPreviewHtml(previewSourceThemeHtml, requestState);
  }, [previewSourceThemeHtml, requestState]);

  return (
    <main className="themblr-shell">
      <section className="panel">
        <h1>Themblr</h1>
        <p className="subtitle">Prompt-first theme generation. Themblr auto-decides layout, cards, typography, and modules for each run.</p>

        <div className="grid one">
          <label>
            Theme Name
            <input
              value={requestState.themeName}
              onChange={(event) =>
                setRequestState((prev) => ({
                  ...prev,
                  themeName: event.target.value,
                }))
              }
            />
          </label>
        </div>

        <label>
          Creative Prompt
          <textarea
            rows={6}
            value={requestState.prompt}
            onChange={(event) =>
              setRequestState((prev) => ({
                ...prev,
                prompt: event.target.value,
              }))
            }
          />
        </label>

        <div className="actions">
          <button type="button" disabled={isGenerating} onClick={runGenerate}>
            {isGenerating ? "Generating..." : "Generate Theme"}
          </button>
        </div>

        {isGenerating ? (
          <div className="gen-progress" role="status" aria-live="polite">
            <div className="gen-progress-head">
              <strong>Generating theme</strong>
              <span>{Math.max(1, Math.floor(elapsedMs / 1000))}s</span>
            </div>
            <div className="gen-progress-track" aria-hidden="true">
              <span className="gen-progress-fill" style={{ width: `${progressPercent(generateStage, elapsedMs)}%` }} />
            </div>
            <p className="gen-progress-stage">{stageLabel[generateStage]}</p>
          </div>
        ) : null}

        {lastDurationMs !== null && !error ? <p className="gen-complete">Generated in {Math.max(1, Math.round(lastDurationMs / 1000))}s</p> : null}

        {error ? <p className="error">{error}</p> : null}
      </section>

      <section className="panel output">
        <div className="browser-frame">
          <div className="browser-toolbar">
            <div className="browser-chrome">
              <span className="browser-dot dot-red" />
              <span className="browser-dot dot-yellow" />
              <span className="browser-dot dot-green" />
              <div className="browser-address">{outputView === "preview" ? "tumblr.local/preview" : result?.fileName || "theme.html"}</div>
            </div>
            <div className="browser-actions">
              <div className="output-tabs">
                <button type="button" className={outputView === "preview" ? "tab is-active" : "tab"} onClick={() => setOutputView("preview")}>
                  Live Preview
                </button>
                <button
                  type="button"
                  className={outputView === "code" ? "tab is-active" : "tab"}
                  onClick={() => setOutputView("code")}
                  disabled={!result}
                >
                  Generated HTML
                </button>
              </div>
              {result ? (
                <button type="button" className="frame-download" onClick={() => downloadText(result.fileName, result.themeHtml, "text/html;charset=utf-8")}>
                  Download theme.html
                </button>
              ) : null}
            </div>
          </div>

          {outputView === "preview" ? (
            previewHtml ? (
              <iframe
                title="Theme preview"
                className="theme-preview-frame"
                srcDoc={previewHtml}
                sandbox="allow-scripts allow-forms"
              />
            ) : (
              <p className="preview-empty">Preview unavailable. Check starter template path in environment.</p>
            )
          ) : result ? (
            <div className="code-pane">
              <textarea className="code" readOnly value={result.themeHtml} rows={26} />
            </div>
          ) : (
            <p className="preview-empty">Generate a theme to view code output.</p>
          )}
        </div>
      </section>
    </main>
  );
}
