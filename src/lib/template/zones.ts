import {
  EDITABLE_ZONE_KEYS,
  LOCKED_ZONE_KEYS,
  REQUIRED_CSS_VARIABLES,
  REQUIRED_META_OPTION_NAMES,
  REQUIRED_STABLE_HOOKS,
  type EditableZoneKey,
  type LockedZoneKey,
} from "@/lib/contracts";
import { escapeRegExp } from "@/lib/utils";
import type {
  ChangedZoneSummary,
  EditableZones,
  LockedZoneSnapshot,
  TemplateBundle,
  ZoneExtraction,
} from "@/lib/template/types";

const STYLE_BLOCK_RE = /<style>([\s\S]*?)<\/style>/;
const HEADER_RE = /<header class="site-header[\s\S]*?<\/header>/;
const SIDEBAR_RE = /\{block:IfShowSidebar\}\s*<aside class="site-sidebar[\s\S]*?<\/aside>\s*\{\/block:IfShowSidebar\}/;
const CONTEXT_RE = /(<main id="main-content" class="site-main" role="main">)([\s\S]*?)(<div class="post-feed">)/;

const POST_RENDER_CORE_RE = /<div class="post-feed">[\s\S]*?<\/main>/;
const JS_CORE_RE = /<script>[\s\S]*?window\.ThemeStarter = ThemeStarter;[\s\S]*?<\/script>/;
const ROOT_CONTRACT_RE = /<html[\s\S]*?>/;

function mustMatch(regex: RegExp, source: string, name: string): RegExpExecArray {
  const match = regex.exec(source);
  if (!match) {
    throw new Error(`Unable to extract ${name} from starter template`);
  }
  return match;
}

function safeMatchValue(regex: RegExp, source: string): string | null {
  const match = regex.exec(source);
  return match ? match[0] : null;
}

function extractCssCore(styleContent: string): string {
  const marker = "{CustomCSS}";
  const markerIndex = styleContent.indexOf(marker);
  if (markerIndex === -1) {
    throw new Error("Starter style block is missing {CustomCSS} marker");
  }

  return styleContent.slice(0, markerIndex).trimEnd();
}

function sanitizeMetaContent(value: string): string {
  return value.replace(/[\r\n]+/g, " ").replace(/["']/g, "").trim().slice(0, 240);
}

function replaceMetaContent(html: string, name: string, value: string): string {
  const re = new RegExp(
    `(<meta\\s+[^>]*name=(['"])${escapeRegExp(name)}\\2[^>]*content=(['"]))([^"']*)(\\3[^>]*>)`,
    "i",
  );

  return html.replace(re, (_all, p1: string, _p2: string, _p3: string, _old: string, p5: string) => {
    return `${p1}${sanitizeMetaContent(value)}${p5}`;
  });
}

function extractLockedZoneSnapshots(html: string): LockedZoneSnapshot[] {
  const postRenderCore = mustMatch(POST_RENDER_CORE_RE, html, "postRenderCore")[0];
  const jsCore = mustMatch(JS_CORE_RE, html, "jsCore")[0];
  const rootContract = mustMatch(ROOT_CONTRACT_RE, html, "rootContract")[0];

  return [
    { key: "postRenderCore", value: postRenderCore },
    { key: "jsCore", value: jsCore },
    { key: "rootContract", value: rootContract },
  ];
}

function extractLockedZoneSnapshotMapSafe(html: string): Partial<Record<LockedZoneKey, string>> {
  return {
    postRenderCore: safeMatchValue(POST_RENDER_CORE_RE, html) ?? undefined,
    jsCore: safeMatchValue(JS_CORE_RE, html) ?? undefined,
    rootContract: safeMatchValue(ROOT_CONTRACT_RE, html) ?? undefined,
  };
}

export function extractZones(templateHtml: string): ZoneExtraction {
  const styleMatch = mustMatch(STYLE_BLOCK_RE, templateHtml, "style block");
  const headerMatch = mustMatch(HEADER_RE, templateHtml, "header section");
  const sidebarMatch = mustMatch(SIDEBAR_RE, templateHtml, "sidebar section");
  const contextMatch = mustMatch(CONTEXT_RE, templateHtml, "context section");

  const editableZones: EditableZones = {
    cssCore: extractCssCore(styleMatch[1]),
    headerSection: headerMatch[0],
    sidebarSection: sidebarMatch[0],
    contextSection: contextMatch[2].trim(),
  };

  return {
    editableZones,
    editableZoneSnapshots: EDITABLE_ZONE_KEYS.map((key) => ({ key, value: editableZones[key] })),
    lockedZoneSnapshots: extractLockedZoneSnapshots(templateHtml),
  };
}

function normalizeZone(zone: string): string {
  return zone.trim();
}

const CSS_VAR_FALLBACKS: Record<string, string> = {
  "--t-bg": "#f7f8fb",
  "--t-surface": "#ffffff",
  "--t-text": "#131722",
  "--t-muted": "#5d6778",
  "--t-accent": "#2f6fed",
  "--t-border": "#d8dee8",
  "--t-radius": "14px",
  "--t-gap": "1rem",
  "--t-max-post": "760px",
};

function detectMissingCssContracts(cssCore: string): { missingHooks: string[]; missingVars: string[] } {
  const missingHooks = REQUIRED_STABLE_HOOKS.filter((hook) => !cssCore.includes(hook));
  const missingVars = REQUIRED_CSS_VARIABLES.filter((name) => !new RegExp(`${escapeRegExp(name)}\\s*:`, "i").test(cssCore));

  return { missingHooks: [...missingHooks], missingVars: [...missingVars] };
}

function shouldMergeWithBaseCss(baseCssCore: string, overrideCssCore: string): boolean {
  if (overrideCssCore.length < 1200) {
    return true;
  }

  const missingContracts = detectMissingCssContracts(overrideCssCore);
  if (missingContracts.missingHooks.length > 0 || missingContracts.missingVars.length > 0) {
    return true;
  }

  return overrideCssCore.length < Math.floor(baseCssCore.length * 0.65);
}

function buildCssContractBackfill(missingHooks: string[], missingVars: string[]): string {
  const chunks: string[] = [];

  if (missingVars.length > 0) {
    const vars = missingVars
      .map((name) => {
        const fallback = CSS_VAR_FALLBACKS[name];
        return fallback ? `  ${name}: ${fallback};` : `  ${name}: initial;`;
      })
      .join("\n");
    chunks.push(`:root {\n${vars}\n}`);
  }

  if (missingHooks.length > 0) {
    const hooks = missingHooks.map((hook) => `${hook} {}`).join("\n");
    chunks.push(hooks);
  }

  return chunks.join("\n\n");
}

function applyCssCore(html: string, cssCore: string): string {
  return html.replace(STYLE_BLOCK_RE, (_full, styleContent: string) => {
    const marker = "{CustomCSS}";
    const markerIndex = styleContent.indexOf(marker);
    if (markerIndex === -1) {
      return _full;
    }

    const baseCssCore = styleContent.slice(0, markerIndex).trimEnd();
    const normalizedOverride = normalizeZone(cssCore);
    let mergedCssCore = normalizedOverride;

    if (shouldMergeWithBaseCss(baseCssCore, normalizedOverride)) {
      mergedCssCore = `${baseCssCore}\n\n        /* Themblr AI override */\n        ${normalizedOverride}`;
    } else {
      const { missingHooks, missingVars } = detectMissingCssContracts(normalizedOverride);
      if (missingHooks.length > 0 || missingVars.length > 0) {
        const backfill = buildCssContractBackfill(missingHooks, missingVars);
        mergedCssCore = `${normalizedOverride}\n\n        /* Themblr contract backfill */\n        ${backfill}`;
      }
    }

    const markerAndSuffix = styleContent.slice(markerIndex);
    const nextContent = `${mergedCssCore}\n\n        ${markerAndSuffix.trimStart()}`;
    return `<style>\n${nextContent}\n    </style>`;
  });
}

function applyHeaderSection(html: string, headerSection: string): string {
  return html.replace(HEADER_RE, `${normalizeZone(headerSection)}`);
}

function applySidebarSection(html: string, sidebarSection: string): string {
  return html.replace(SIDEBAR_RE, `${normalizeZone(sidebarSection)}`);
}

function applyContextSection(html: string, contextSection: string): string {
  return html.replace(CONTEXT_RE, (_full, start: string, _old: string, end: string) => {
    const normalized = normalizeZone(contextSection);
    return `${start}\n${normalized}\n\n            ${end}`;
  });
}

function buildChangedZoneSummary(base: EditableZones, next: EditableZones): ChangedZoneSummary[] {
  return (EDITABLE_ZONE_KEYS as readonly EditableZoneKey[]).map((zone) => {
    const oldValue = base[zone] ?? "";
    const newValue = next[zone] ?? "";

    return {
      zone,
      changed: oldValue !== newValue,
      oldChars: oldValue.length,
      newChars: newValue.length,
    };
  });
}

function resolveFinalEditableZones(
  base: EditableZones,
  overrides: Partial<EditableZones>,
  composedHtml: string,
): EditableZones {
  try {
    return extractZones(composedHtml).editableZones;
  } catch {
    return {
      cssCore: typeof overrides.cssCore === "string" && overrides.cssCore.trim() ? normalizeZone(overrides.cssCore) : base.cssCore,
      headerSection:
        typeof overrides.headerSection === "string" && overrides.headerSection.trim()
          ? normalizeZone(overrides.headerSection)
          : base.headerSection,
      sidebarSection:
        typeof overrides.sidebarSection === "string" && overrides.sidebarSection.trim()
          ? normalizeZone(overrides.sidebarSection)
          : base.sidebarSection,
      contextSection:
        typeof overrides.contextSection === "string" && overrides.contextSection.trim()
          ? normalizeZone(overrides.contextSection)
          : base.contextSection,
    };
  }
}

export interface ComposeOptions {
  templateHtml: string;
  zoneOverrides: Partial<EditableZones>;
  metaDefaults?: Record<string, string>;
}

export interface ComposeResult {
  themeHtml: string;
  changedRegions: ChangedZoneSummary[];
}

export function applyMetaDefaults(html: string, metaDefaults: Record<string, string>): string {
  let updated = html;

  for (const [name, value] of Object.entries(metaDefaults)) {
    if (!REQUIRED_META_OPTION_NAMES.includes(name as (typeof REQUIRED_META_OPTION_NAMES)[number])) {
      continue;
    }

    if (name.startsWith("select:")) {
      continue;
    }

    updated = replaceMetaContent(updated, name, value);
  }

  return updated;
}

export function composeTemplate(options: ComposeOptions): ComposeResult {
  const { templateHtml, zoneOverrides, metaDefaults = {} } = options;
  const baseExtraction = extractZones(templateHtml);

  let composed = templateHtml;

  if (typeof zoneOverrides.cssCore === "string" && zoneOverrides.cssCore.trim()) {
    composed = applyCssCore(composed, zoneOverrides.cssCore);
  }

  if (typeof zoneOverrides.headerSection === "string" && zoneOverrides.headerSection.trim()) {
    composed = applyHeaderSection(composed, zoneOverrides.headerSection);
  }

  if (typeof zoneOverrides.sidebarSection === "string" && zoneOverrides.sidebarSection.trim()) {
    composed = applySidebarSection(composed, zoneOverrides.sidebarSection);
  }

  if (typeof zoneOverrides.contextSection === "string" && zoneOverrides.contextSection.trim()) {
    composed = applyContextSection(composed, zoneOverrides.contextSection);
  }

  composed = applyMetaDefaults(composed, metaDefaults);

  const finalEditableZones = resolveFinalEditableZones(baseExtraction.editableZones, zoneOverrides, composed);

  return {
    themeHtml: composed,
    changedRegions: buildChangedZoneSummary(baseExtraction.editableZones, finalEditableZones),
  };
}

export function repairLockedZones(baseTemplate: string, candidateHtml: string): { repairedHtml: string; repairedCount: number } {
  const baseLockedSnapshots = extractLockedZoneSnapshots(baseTemplate);
  const candidateLockedSnapshotMap = extractLockedZoneSnapshotMapSafe(candidateHtml);

  let repairedHtml = candidateHtml;
  let repairedCount = 0;

  for (const key of LOCKED_ZONE_KEYS) {
    const baseSnapshot = baseLockedSnapshots.find((item) => item.key === key);
    const candidateSnapshot = candidateLockedSnapshotMap[key];

    if (!baseSnapshot || !candidateSnapshot) {
      continue;
    }

    if (baseSnapshot.value !== candidateSnapshot) {
      repairedHtml = repairedHtml.replace(candidateSnapshot, baseSnapshot.value);
      repairedCount += 1;
    }
  }

  return { repairedHtml, repairedCount };
}

export function getTemplateMetadata(bundle: TemplateBundle) {
  const extracted = extractZones(bundle.templateHtml);

  return {
    templateHash: bundle.templateHash,
    templatePath: bundle.templatePath,
    editableZones: extracted.editableZoneSnapshots.map((zone) => zone.key),
    lockedZones: extracted.lockedZoneSnapshots.map((zone) => zone.key),
  };
}
