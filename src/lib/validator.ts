import {
  MAX_INLINE_SCRIPT_WARNING_CHARS,
  MAX_THEME_BYTES_WARNING,
  RECOMMENDED_LANG_KEYS,
  REQUIRED_CSS_VARIABLES,
  REQUIRED_JS_SIGNATURES,
  REQUIRED_META_OPTION_NAMES,
  REQUIRED_ROOT_DATA_ATTRS,
  REQUIRED_STABLE_HOOKS,
  REQUIRED_TUMBLR_BLOCKS,
} from "@/lib/contracts";
import type { ValidationCheck, ValidationResult } from "@/lib/schema";

function addCheck(checks: ValidationCheck[], check: ValidationCheck) {
  checks.push(check);
}

function collectErrorsAndWarnings(checks: ValidationCheck[]): Pick<ValidationResult, "errors" | "warnings" | "passed"> {
  const errors = checks.filter((check) => !check.passed && check.severity === "error").map((check) => check.message);
  const warnings = checks
    .filter((check) => !check.passed && check.severity === "warning")
    .map((check) => check.message);

  return {
    errors,
    warnings,
    passed: errors.length === 0,
  };
}

function parseMetaNames(themeHtml: string): string[] {
  const names: string[] = [];
  const re = /<meta\s+[^>]*name=(['"])([^"']+)\1[^>]*>/gi;
  let match: RegExpExecArray | null;

  while ((match = re.exec(themeHtml)) !== null) {
    names.push(match[2]);
  }

  return names;
}

function parseBlockBalance(themeHtml: string): { balanced: boolean; errors: string[] } {
  const tokenRe = /\{\/?block:([A-Za-z0-9]+)[^}]*\}/g;
  const stack: string[] = [];
  const errors: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = tokenRe.exec(themeHtml)) !== null) {
    const token = match[0];
    const name = match[1];
    const isClose = token.startsWith("{/block:");

    if (!isClose) {
      stack.push(name);
      continue;
    }

    const popped = stack.pop();
    if (popped !== name) {
      errors.push(`block mismatch: expected close for ${popped ?? "<none>"}, got ${name}`);
    }
  }

  if (stack.length > 0) {
    errors.push(`unclosed blocks: ${stack.join(", ")}`);
  }

  return {
    balanced: errors.length === 0,
    errors,
  };
}

function getInlineScriptLength(themeHtml: string): number {
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  let total = 0;
  let match: RegExpExecArray | null;

  while ((match = re.exec(themeHtml)) !== null) {
    total += match[1].length;
  }

  return total;
}

function hasCustomCssInsideStyle(themeHtml: string): boolean {
  const styleRe = /<style>([\s\S]*?)<\/style>/i;
  const styleMatch = styleRe.exec(themeHtml);
  if (!styleMatch) {
    return false;
  }

  const marker = "{CustomCSS}";
  if (!styleMatch[1].includes(marker)) {
    return false;
  }

  const withoutStyle = themeHtml.replace(styleRe, "");
  return !withoutStyle.includes(marker);
}

function hasExternalScriptSrc(themeHtml: string): boolean {
  return /<script[^>]+src=['"](?:https?:)?\/\//i.test(themeHtml);
}

function hasExternalCssImport(themeHtml: string): boolean {
  return /@import\s+url\((['"])?https?:\/\//i.test(themeHtml);
}

function hasExternalFontCdn(themeHtml: string): boolean {
  return /<link[^>]+href=['"]https?:\/\/[^"']*(fonts\.googleapis|fonts\.gstatic|use\.typekit|bootstrapcdn|cdn\.jsdelivr|cdnjs|unpkg)/i.test(
    themeHtml,
  );
}

function collectLangKeys(themeHtml: string): Set<string> {
  const keys = new Set<string>();
  const re = /\{lang:[^}]+\}/g;
  let match: RegExpExecArray | null;

  while ((match = re.exec(themeHtml)) !== null) {
    keys.add(match[0]);
  }

  return keys;
}

export interface ValidationContext {
  baseLangKeys?: string[];
}

export function validateThemeHtml(themeHtml: string, context: ValidationContext = {}): ValidationResult {
  const checks: ValidationCheck[] = [];

  const metaNames = parseMetaNames(themeHtml);
  const missingMeta = REQUIRED_META_OPTION_NAMES.filter((name) => !metaNames.includes(name));

  addCheck(checks, {
    id: "required-meta-options",
    passed: missingMeta.length === 0,
    severity: "error",
    message:
      missingMeta.length === 0
        ? "All required meta option names are present"
        : `Missing required meta options: ${missingMeta.join(", ")}`,
    details: missingMeta.length ? missingMeta : undefined,
  });

  const missingRootAttrs = REQUIRED_ROOT_DATA_ATTRS.filter((attr) => !new RegExp(`${attr}=`, "i").test(themeHtml));
  addCheck(checks, {
    id: "required-root-attrs",
    passed: missingRootAttrs.length === 0,
    severity: "error",
    message:
      missingRootAttrs.length === 0
        ? "Required root data attributes are present"
        : `Missing root attributes: ${missingRootAttrs.join(", ")}`,
    details: missingRootAttrs.length ? missingRootAttrs : undefined,
  });

  const missingHooks = REQUIRED_STABLE_HOOKS.filter((hook) => !themeHtml.includes(hook));
  addCheck(checks, {
    id: "required-stable-hooks",
    passed: missingHooks.length === 0,
    severity: "error",
    message:
      missingHooks.length === 0
        ? "Required stable hooks are present"
        : `Missing stable hooks: ${missingHooks.join(", ")}`,
    details: missingHooks.length ? missingHooks : undefined,
  });

  const missingCssVars = REQUIRED_CSS_VARIABLES.filter((name) => !new RegExp(`${name}\\s*:`, "i").test(themeHtml));
  addCheck(checks, {
    id: "required-css-vars",
    passed: missingCssVars.length === 0,
    severity: "error",
    message:
      missingCssVars.length === 0
        ? "Required CSS variables are present"
        : `Missing CSS variables: ${missingCssVars.join(", ")}`,
    details: missingCssVars.length ? missingCssVars : undefined,
  });

  const missingSignatures = REQUIRED_JS_SIGNATURES.filter((signature) => !themeHtml.includes(signature));
  addCheck(checks, {
    id: "required-js-signatures",
    passed: missingSignatures.length === 0,
    severity: "error",
    message:
      missingSignatures.length === 0
        ? "Required JS signatures are present"
        : `Missing JS signatures: ${missingSignatures.join(", ")}`,
    details: missingSignatures.length ? missingSignatures : undefined,
  });

  const missingBlocks = REQUIRED_TUMBLR_BLOCKS.filter((name) => !new RegExp(`\\{block:${name}`, "i").test(themeHtml));
  addCheck(checks, {
    id: "required-tumblr-blocks",
    passed: missingBlocks.length === 0,
    severity: "error",
    message:
      missingBlocks.length === 0
        ? "Required Tumblr blocks are present"
        : `Missing Tumblr blocks: ${missingBlocks.join(", ")}`,
    details: missingBlocks.length ? missingBlocks : undefined,
  });

  const blockBalance = parseBlockBalance(themeHtml);
  addCheck(checks, {
    id: "block-balance",
    passed: blockBalance.balanced,
    severity: "error",
    message: blockBalance.balanced ? "Tumblr block tags are balanced" : `Block balance errors: ${blockBalance.errors.join("; ")}`,
    details: blockBalance.errors.length ? blockBalance.errors : undefined,
  });

  addCheck(checks, {
    id: "disallow-external-script-src",
    passed: !hasExternalScriptSrc(themeHtml),
    severity: "error",
    message: hasExternalScriptSrc(themeHtml)
      ? "External script src dependencies are not allowed"
      : "No external script src dependencies detected",
  });

  addCheck(checks, {
    id: "disallow-external-css-import",
    passed: !hasExternalCssImport(themeHtml),
    severity: "error",
    message: hasExternalCssImport(themeHtml)
      ? "External CSS @import dependencies are not allowed"
      : "No external CSS @import dependencies detected",
  });

  addCheck(checks, {
    id: "disallow-external-font-cdn",
    passed: !hasExternalFontCdn(themeHtml),
    severity: "error",
    message: hasExternalFontCdn(themeHtml)
      ? "External font CDN links are not allowed"
      : "No external font CDN links detected",
  });

  addCheck(checks, {
    id: "customcss-inside-style",
    passed: hasCustomCssInsideStyle(themeHtml),
    severity: "error",
    message: hasCustomCssInsideStyle(themeHtml)
      ? "{CustomCSS} marker exists inside style block"
      : "{CustomCSS} marker is missing or outside style block",
  });

  const bytes = Buffer.byteLength(themeHtml, "utf8");
  addCheck(checks, {
    id: "warn-theme-size",
    passed: bytes <= MAX_THEME_BYTES_WARNING,
    severity: "warning",
    message:
      bytes <= MAX_THEME_BYTES_WARNING
        ? "Theme size is within warning threshold"
        : `Theme size warning: ${bytes} bytes exceeds ${MAX_THEME_BYTES_WARNING}`,
  });

  const inlineScriptChars = getInlineScriptLength(themeHtml);
  addCheck(checks, {
    id: "warn-inline-script-size",
    passed: inlineScriptChars <= MAX_INLINE_SCRIPT_WARNING_CHARS,
    severity: "warning",
    message:
      inlineScriptChars <= MAX_INLINE_SCRIPT_WARNING_CHARS
        ? "Inline script size is within warning threshold"
        : `Inline script warning: ${inlineScriptChars} chars exceeds ${MAX_INLINE_SCRIPT_WARNING_CHARS}`,
  });

  const langKeys = collectLangKeys(themeHtml);
  const sourceLangKeys = context.baseLangKeys && context.baseLangKeys.length ? context.baseLangKeys : [...RECOMMENDED_LANG_KEYS];
  const missingLangKeys = sourceLangKeys.filter((key) => !langKeys.has(key));

  addCheck(checks, {
    id: "warn-missing-localization-keys",
    passed: missingLangKeys.length === 0,
    severity: "warning",
    message:
      missingLangKeys.length === 0
        ? "Localized language keys are preserved"
        : `Missing localized language keys: ${missingLangKeys.slice(0, 12).join(", ")}${missingLangKeys.length > 12 ? " ..." : ""}`,
    details: missingLangKeys.length ? missingLangKeys : undefined,
  });

  const status = collectErrorsAndWarnings(checks);

  return {
    passed: status.passed,
    errors: status.errors,
    warnings: status.warnings,
    checks,
  };
}
