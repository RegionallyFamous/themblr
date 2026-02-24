"use client";

import { useEffect, useMemo, useState } from "react";

import {
  GenerateResponseSchema,
  PresetSchema,
  type GenerateRequest,
  type GenerateResponse,
  type ValidationCheck,
} from "@/lib/schema";
import { normalizeSlug } from "@/lib/utils";

const PRESET_STORAGE_KEY = "themblr.presets.v1";

type PresetMap = Record<string, GenerateRequest>;
type BrowserStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const defaultRequest: GenerateRequest = {
  themeName: "My Themblr Theme",
  slug: "my-themblr-theme",
  structured: {
    layout: "stream",
    postWidth: "regular",
    cardStyle: "outlined",
    headerAlignment: "left",
    notesAvatarSize: "small",
    toggles: {
      showSidebar: true,
      showSearch: true,
      showFeaturedTags: true,
      showFollowing: false,
      showLikesWidget: false,
      showRelatedPosts: true,
      showFooter: true,
      enableMotion: true,
    },
    tone: "Clean, thoughtful, and editorial",
    paletteHint: "Neutral base with one clear accent",
  },
  prompt: "Create a modern editorial theme variant with crisp cards, strong hierarchy, and balanced spacing.",
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

export function ThemblrApp() {
  const [requestState, setRequestState] = useState<GenerateRequest>(defaultRequest);
  const [presets, setPresets] = useState<PresetMap>({});
  const [selectedPreset, setSelectedPreset] = useState<string>("");
  const [result, setResult] = useState<GenerateResponse | null>(null);
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

  function updateStructured<K extends keyof GenerateRequest["structured"]>(key: K, value: GenerateRequest["structured"][K]) {
    setRequestState((prev) => ({
      ...prev,
      structured: {
        ...prev.structured,
        [key]: value,
      },
    }));
  }

  function updateToggle<K extends keyof GenerateRequest["structured"]["toggles"]>(key: K, value: boolean) {
    setRequestState((prev) => ({
      ...prev,
      structured: {
        ...prev.structured,
        toggles: {
          ...prev.structured.toggles,
          [key]: value,
        },
      },
    }));
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
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(requestState),
      });

      const payload = await response.json();

      if (!response.ok && !payload?.validation) {
        throw new Error(payload?.error || "Generation failed");
      }

      const parsed = GenerateResponseSchema.parse(payload);
      setResult(parsed);
    } catch (err) {
      setResult(null);
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setIsGenerating(false);
    }
  }

  const presetNames = useMemo(() => Object.keys(presets).sort(), [presets]);

  return (
    <main className="themblr-shell">
      <section className="panel">
        <h1>Themblr</h1>
        <p className="subtitle">AI theme generator for Tumblr starter themes.</p>

        <div className="grid two">
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

          <label>
            Slug
            <div className="inline">
              <input
                value={requestState.slug}
                onChange={(event) =>
                  setRequestState((prev) => ({
                    ...prev,
                    slug: event.target.value,
                  }))
                }
              />
              <button
                type="button"
                onClick={() =>
                  setRequestState((prev) => ({
                    ...prev,
                    slug: normalizeSlug(prev.themeName),
                  }))
                }
              >
                Auto
              </button>
            </div>
          </label>
        </div>

        <h2>Structured Controls</h2>
        <div className="grid four">
          <label>
            Layout
            <select
              value={requestState.structured.layout}
              onChange={(event) => updateStructured("layout", event.target.value as GenerateRequest["structured"]["layout"])}
            >
              <option value="stream">stream</option>
              <option value="split">split</option>
              <option value="grid">grid</option>
            </select>
          </label>

          <label>
            Post Width
            <select
              value={requestState.structured.postWidth}
              onChange={(event) =>
                updateStructured("postWidth", event.target.value as GenerateRequest["structured"]["postWidth"])
              }
            >
              <option value="compact">compact</option>
              <option value="regular">regular</option>
              <option value="wide">wide</option>
            </select>
          </label>

          <label>
            Card Style
            <select
              value={requestState.structured.cardStyle}
              onChange={(event) =>
                updateStructured("cardStyle", event.target.value as GenerateRequest["structured"]["cardStyle"])
              }
            >
              <option value="outlined">outlined</option>
              <option value="elevated">elevated</option>
              <option value="minimal">minimal</option>
            </select>
          </label>

          <label>
            Header Alignment
            <select
              value={requestState.structured.headerAlignment}
              onChange={(event) =>
                updateStructured("headerAlignment", event.target.value as GenerateRequest["structured"]["headerAlignment"])
              }
            >
              <option value="left">left</option>
              <option value="center">center</option>
            </select>
          </label>
        </div>

        <div className="grid three">
          <label>
            Notes Avatar Size
            <select
              value={requestState.structured.notesAvatarSize}
              onChange={(event) =>
                updateStructured("notesAvatarSize", event.target.value as GenerateRequest["structured"]["notesAvatarSize"])
              }
            >
              <option value="small">small</option>
              <option value="large">large</option>
            </select>
          </label>

          <label>
            Typography Tone
            <input
              value={requestState.structured.tone}
              onChange={(event) => updateStructured("tone", event.target.value)}
            />
          </label>

          <label>
            Palette Hint
            <input
              value={requestState.structured.paletteHint}
              onChange={(event) => updateStructured("paletteHint", event.target.value)}
            />
          </label>
        </div>

        <h3>Toggles</h3>
        <div className="toggle-grid">
          {Object.entries(requestState.structured.toggles).map(([key, value]) => (
            <label className="toggle" key={key}>
              <input
                type="checkbox"
                checked={value}
                onChange={(event) =>
                  updateToggle(key as keyof GenerateRequest["structured"]["toggles"], event.target.checked)
                }
              />
              <span>{key}</span>
            </label>
          ))}
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

        {!result ? <p>No generation result yet.</p> : null}

        {result ? (
          <>
            <div className="inline wrap">
              <strong>{result.validation.passed ? "Validation passed" : "Validation failed"}</strong>
              <button type="button" onClick={() => downloadText(result.fileName, result.themeHtml, "text/html;charset=utf-8")}>Download theme.html</button>
            </div>

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

            <h3>Generated HTML</h3>
            <textarea className="code" readOnly value={result.themeHtml} rows={26} />
          </>
        ) : null}
      </section>
    </main>
  );
}
