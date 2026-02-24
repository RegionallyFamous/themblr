"use client";

import { useEffect, useMemo, useState } from "react";

import {
  GenerateResponseSchema,
  PresetSchema,
  type GenerateRequest,
  type GenerateResponse,
  type ValidationCheck,
} from "@/lib/schema";
import { buildFakeTumblrPreviewHtml } from "@/lib/preview/fake-tumblr";
import { normalizeSlug } from "@/lib/utils";

const PRESET_STORAGE_KEY = "themblr.presets.v1";

type PresetMap = Record<string, GenerateRequest>;
type BrowserStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const defaultRequest: GenerateRequest = {
  themeName: "Default Era",
  slug: "default-era",
  structured: decideStructured("Default Era", "Neo-brutal Tumblr theme with strong contrast and sharp hierarchy."),
  prompt: "Build a neo-brutal Tumblr theme variation with punchy contrast, crisp hierarchy, and expressive type.",
};

function toPrettyJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function getBrowserStorage(): BrowserStorage | null {
  if (typeof window === "undefined") {
    return null;
  }

  const storageCandidate = window.localStorage as Partial<Storage> | undefined;
  if (!storageCandidate) {
    return null;
  }

  if (
    typeof storageCandidate.getItem !== "function" ||
    typeof storageCandidate.setItem !== "function" ||
    typeof storageCandidate.removeItem !== "function"
  ) {
    return null;
  }

  return storageCandidate as BrowserStorage;
}

function serializePreset(name: string, data: GenerateRequest) {
  return {
    version: "1.0",
    name,
    updatedAt: new Date().toISOString(),
    data,
  } as const;
}

function downloadText(filename: string, content: string, mimeType = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function checkClass(check: ValidationCheck) {
  if (check.passed) {
    return "check pass";
  }

  return check.severity === "warning" ? "check warn" : "check fail";
}

function keywordMatch(input: string, keywords: string[]): boolean {
  return keywords.some((keyword) => input.includes(keyword));
}

function hashSeed(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 33 + input.charCodeAt(i)) % 2_147_483_647;
  }
  return Math.abs(hash);
}

function decideStructured(themeName: string, prompt: string): GenerateRequest["structured"] {
  const raw = `${themeName} ${prompt}`.toLowerCase();
  const seed = hashSeed(raw);

  const layout =
    keywordMatch(raw, ["grid", "gallery", "masonry", "catalog"]) ? "grid" : keywordMatch(raw, ["split", "magazine", "editorial", "sidebar"]) ? "split" : "stream";

  const postWidth =
    keywordMatch(raw, ["compact", "dense", "tight"]) ? "compact" : keywordMatch(raw, ["wide", "spacious", "cinematic"]) ? "wide" : "regular";

  const cardStyle =
    keywordMatch(raw, ["minimal", "clean", "bare"]) ? "minimal" : keywordMatch(raw, ["elevated", "shadow", "layered"]) ? "elevated" : "outlined";

  const headerAlignment = keywordMatch(raw, ["center", "centered"]) || seed % 6 === 0 ? "center" : "left";
  const notesAvatarSize = keywordMatch(raw, ["large avatar", "big avatar", "avatar-forward"]) ? "large" : "small";
  const enableMotion = !keywordMatch(raw, ["no motion", "static", "reduced motion"]);

  let paletteHint = "Neo-brutal high contrast with one punchy accent";
  if (keywordMatch(raw, ["mono", "monochrome", "black and white"])) {
    paletteHint = "High contrast monochrome with a single warning accent";
  } else if (keywordMatch(raw, ["warm", "sunset", "earthy"])) {
    paletteHint = "Warm paper tones with hot orange and black outlines";
  } else if (keywordMatch(raw, ["cool", "ocean", "cyber"])) {
    paletteHint = "Cool steel base with electric cyan accents";
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
    tone: prompt.trim().slice(0, 120) || "Bold, expressive, high-contrast editorial",
    paletteHint,
  };
}

interface ThemblrAppProps {
  initialThemeHtml?: string;
}

export function ThemblrApp({ initialThemeHtml = "" }: ThemblrAppProps) {
  const [requestState, setRequestState] = useState<GenerateRequest>(defaultRequest);
  const [presets, setPresets] = useState<PresetMap>({});
  const [selectedPreset, setSelectedPreset] = useState<string>("");
  const [result, setResult] = useState<GenerateResponse | null>(null);
  const [outputView, setOutputView] = useState<"preview" | "code">("preview");
  const [error, setError] = useState<string>("");
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    const storage = getBrowserStorage();
    if (!storage) {
      return;
    }

    try {
      const raw = storage.getItem(PRESET_STORAGE_KEY);
      if (!raw) {
        return;
      }

      const parsed = JSON.parse(raw) as PresetMap;
      setPresets(parsed);
    } catch {
      storage.removeItem(PRESET_STORAGE_KEY);
    }
  }, []);

  function persistPresets(next: PresetMap) {
    setPresets(next);

    const storage = getBrowserStorage();
    if (storage) {
      storage.setItem(PRESET_STORAGE_KEY, JSON.stringify(next));
    }
  }

  function savePreset() {
    const name = window.prompt("Preset name", requestState.themeName)?.trim();
    if (!name) {
      return;
    }

    const next = {
      ...presets,
      [name]: requestState,
    };

    persistPresets(next);
    setSelectedPreset(name);
  }

  function loadPreset(name: string) {
    if (!name || !presets[name]) {
      return;
    }

    setRequestState(presets[name]);
    setSelectedPreset(name);
  }

  function exportPreset() {
    const name = selectedPreset || requestState.themeName || "themblr-preset";
    const payload = serializePreset(name, requestState);

    downloadText(`${normalizeSlug(name)}-preset.json`, toPrettyJson(payload), "application/json;charset=utf-8");
  }

  async function importPreset(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      const parsed = PresetSchema.parse(JSON.parse(text));

      const next = {
        ...presets,
        [parsed.name]: parsed.data,
      };

      persistPresets(next);
      setSelectedPreset(parsed.name);
      setRequestState(parsed.data);
      setError("");
    } catch {
      setError("Invalid preset file. Expected Themblr preset schema v1.0.");
    } finally {
      event.target.value = "";
    }
  }

  async function runGenerate() {
    setIsGenerating(true);
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

      const response = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const responsePayload = await response.json();

      if (!response.ok && !responsePayload?.validation) {
        throw new Error(responsePayload?.error || "Generation failed");
      }

      const parsed = GenerateResponseSchema.parse(responsePayload);
      setResult(parsed);
      setOutputView("preview");
    } catch (err) {
      setResult(null);
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setIsGenerating(false);
    }
  }

  const presetNames = useMemo(() => Object.keys(presets).sort(), [presets]);
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

        <h2>Presets</h2>
        <div className="inline wrap">
          <select
            value={selectedPreset}
            onChange={(event) => {
              const nextName = event.target.value;
              setSelectedPreset(nextName);
              loadPreset(nextName);
            }}
          >
            <option value="">Select preset</option>
            {presetNames.map((name) => (
              <option value={name} key={name}>
                {name}
              </option>
            ))}
          </select>
          <button type="button" onClick={savePreset}>
            Save
          </button>
          <button type="button" disabled={!selectedPreset} onClick={() => loadPreset(selectedPreset)}>
            Load
          </button>
          <button type="button" onClick={exportPreset}>
            Export JSON
          </button>
          <label className="file-picker">
            Import JSON
            <input type="file" accept="application/json" onChange={importPreset} />
          </label>
        </div>

        <div className="actions">
          <button type="button" disabled={isGenerating} onClick={runGenerate}>
            {isGenerating ? "Generating..." : "Generate Theme"}
          </button>
        </div>

        {error ? <p className="error">{error}</p> : null}
      </section>

      <section className="panel output">
        <h2>Output</h2>

        <div className="inline wrap">
          <strong>{result ? (result.validation.passed ? "Validation passed" : "Validation failed") : "Default Era preview loaded"}</strong>
          {result ? (
            <button type="button" onClick={() => downloadText(result.fileName, result.themeHtml, "text/html;charset=utf-8")}>Download theme.html</button>
          ) : null}
        </div>

        {result ? (
          <>
            <h3>Contract Report</h3>
            <ul className="plain-list">
              <li>Locked regions repaired: {result.report.lockedRegionsRepaired}</li>
              <li>Retry count: {result.report.retryCount}</li>
            </ul>

            <h3>Changed Regions</h3>
            <ul className="plain-list">
              {result.report.changedRegions.map((region) => (
                <li key={region.zone}>
                  {region.zone}: {region.changed ? "changed" : "unchanged"} ({region.oldChars} → {region.newChars} chars)
                </li>
              ))}
            </ul>

            <h3>Checks</h3>
            <div className="checks">
              {result.validation.checks.map((check) => (
                <article className={checkClass(check)} key={check.id}>
                  <h4>{check.id}</h4>
                  <p>{check.message}</p>
                </article>
              ))}
            </div>
          </>
        ) : null}

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

        {outputView === "preview" ? (
          <div className="preview-wrap">
            <p className="preview-note">
              Simulated Tumblr install with sample post data. Use this for layout and style validation before uploading to Tumblr.
            </p>
            {previewHtml ? (
              <iframe
                title="Theme preview"
                className="theme-preview-frame"
                srcDoc={previewHtml}
                sandbox=""
              />
            ) : (
              <p className="preview-note">Preview unavailable. Check starter template path in environment.</p>
            )}
          </div>
        ) : null}

        {outputView === "code" ? (
          result ? (
            <textarea className="code" readOnly value={result.themeHtml} rows={26} />
          ) : (
            <p className="preview-note">Generate a theme to view code output.</p>
          )
        ) : null}
      </section>
    </main>
  );
}
