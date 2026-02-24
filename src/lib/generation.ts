import { buildThemeFileName } from "@/lib/utils";
import { getEnv } from "@/lib/env";
import type { GenerateRequest, GenerateResponse } from "@/lib/schema";
import { composeTemplate, extractZones, repairLockedZones } from "@/lib/template/zones";
import type { TemplateBundle } from "@/lib/template/types";
import { validateThemeHtml } from "@/lib/validator";
import { generateEditableOverridesWithOpenAI } from "@/lib/openai/generate";

const MIN_CSS_CHANGE_RATIO = 0.12;

function countRevertedZones(editableZones: Record<string, string | undefined>): number {
  return ["headerSection", "sidebarSection", "contextSection"].filter((key) => {
    const value = editableZones[key];
    return typeof value === "string" && value.trim().length > 0;
  }).length;
}

function normalizeCssForDiff(cssCore: string): string {
  return cssCore.replace(/\s+/g, " ").trim();
}

function cssChangeRatio(baseCssCore: string, candidateCssCore: string): number {
  const base = normalizeCssForDiff(baseCssCore);
  const candidate = normalizeCssForDiff(candidateCssCore);
  const maxLength = Math.max(base.length, candidate.length, 1);
  const minLength = Math.min(base.length, candidate.length);

  let diffCount = Math.abs(base.length - candidate.length);
  for (let index = 0; index < minLength; index += 1) {
    if (base[index] !== candidate[index]) {
      diffCount += 1;
    }
  }

  return diffCount / maxLength;
}

function extractCssCoreSafe(themeHtml: string): string | null {
  try {
    return extractZones(themeHtml).editableZones.cssCore;
  } catch {
    return null;
  }
}

export async function generateThemeFromStarter(
  request: GenerateRequest,
  templateBundle: TemplateBundle,
): Promise<GenerateResponse> {
  const env = getEnv();
  const baseTemplate = templateBundle.templateHtml;
  const extracted = extractZones(baseTemplate);

  const firstPass = await generateEditableOverridesWithOpenAI({
    request,
    baseEditableZones: extracted.editableZones,
    timeoutMs: env.generationTimeoutMs,
    reducedScope: false,
  });

  let composeResult = composeTemplate({
    templateHtml: baseTemplate,
    zoneOverrides: firstPass.editableZones,
    metaDefaults: firstPass.metaDefaults,
  });

  let repairedCount = 0;
  let retryCount = 0;

  const repairedLocked = repairLockedZones(baseTemplate, composeResult.themeHtml);
  if (repairedLocked.repairedCount > 0) {
    repairedCount += repairedLocked.repairedCount;
    composeResult = {
      ...composeResult,
      themeHtml: repairedLocked.repairedHtml,
    };
  }

  let validation = validateThemeHtml(composeResult.themeHtml, { baseLangKeys: templateBundle.baseLangKeys });
  const baseCssCore = extracted.editableZones.cssCore;

  if (validation.passed) {
    const firstCssCore = extractCssCoreSafe(composeResult.themeHtml);
    const firstChangeRatio = firstCssCore ? cssChangeRatio(baseCssCore, firstCssCore) : 0;

    if (firstCssCore && firstChangeRatio < MIN_CSS_CHANGE_RATIO) {
      retryCount = 1;

      const distinctPass = await generateEditableOverridesWithOpenAI({
        request,
        baseEditableZones: extracted.editableZones,
        timeoutMs: env.generationTimeoutMs,
        reducedScope: true,
        violations: [
          `Similarity score too low (${firstChangeRatio.toFixed(3)}).`,
          "Increase visual differentiation: tokens, type hierarchy, post cards, controls, and module styling.",
        ],
      });

      let distinctCompose = composeTemplate({
        templateHtml: baseTemplate,
        zoneOverrides: {
          cssCore: distinctPass.editableZones.cssCore,
        },
        metaDefaults: distinctPass.metaDefaults,
      });

      const distinctRepair = repairLockedZones(baseTemplate, distinctCompose.themeHtml);
      if (distinctRepair.repairedCount > 0) {
        repairedCount += distinctRepair.repairedCount;
        distinctCompose = {
          ...distinctCompose,
          themeHtml: distinctRepair.repairedHtml,
        };
      }

      const distinctValidation = validateThemeHtml(distinctCompose.themeHtml, { baseLangKeys: templateBundle.baseLangKeys });

      if (distinctValidation.passed) {
        const distinctCssCore = extractCssCoreSafe(distinctCompose.themeHtml);
        const distinctChangeRatio = distinctCssCore ? cssChangeRatio(baseCssCore, distinctCssCore) : firstChangeRatio;

        if (distinctChangeRatio > firstChangeRatio) {
          composeResult = distinctCompose;
          validation = distinctValidation;
        }
      }
    }
  }

  if (!validation.passed) {
    const revertedEditableZoneCount = countRevertedZones(firstPass.editableZones);
    const repairedCompose = composeTemplate({
      templateHtml: baseTemplate,
      zoneOverrides: {
        cssCore: firstPass.editableZones.cssCore,
      },
      metaDefaults: firstPass.metaDefaults,
    });

    const repairedValidation = validateThemeHtml(repairedCompose.themeHtml, { baseLangKeys: templateBundle.baseLangKeys });

    if (repairedValidation.passed) {
      composeResult = repairedCompose;
      validation = repairedValidation;
      repairedCount += revertedEditableZoneCount;
    } else {
      retryCount = 1;

      const secondPass = await generateEditableOverridesWithOpenAI({
        request,
        baseEditableZones: extracted.editableZones,
        timeoutMs: env.generationTimeoutMs,
        reducedScope: true,
        violations: repairedValidation.errors,
      });

      const secondCompose = composeTemplate({
        templateHtml: baseTemplate,
        zoneOverrides: {
          cssCore: secondPass.editableZones.cssCore,
        },
        metaDefaults: secondPass.metaDefaults,
      });

      const secondValidation = validateThemeHtml(secondCompose.themeHtml, { baseLangKeys: templateBundle.baseLangKeys });

      composeResult = secondCompose;
      validation = secondValidation;
    }
  }

  return {
    ok: true,
    fileName: buildThemeFileName(request.slug),
    themeHtml: composeResult.themeHtml,
    validation,
    report: {
      lockedRegionsRepaired: repairedCount,
      retryCount,
      changedRegions: composeResult.changedRegions,
    },
  };
}
