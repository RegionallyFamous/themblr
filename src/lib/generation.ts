import { buildThemeFileName } from "@/lib/utils";
import { getEnv } from "@/lib/env";
import type { GenerateRequest, GenerateResponse } from "@/lib/schema";
import { composeTemplate, extractZones, repairLockedZones } from "@/lib/template/zones";
import type { TemplateBundle } from "@/lib/template/types";
import { validateThemeHtml } from "@/lib/validator";
import { generateEditableOverridesWithOpenAI } from "@/lib/openai/generate";

function countRevertedZones(editableZones: Record<string, string | undefined>): number {
  return ["headerSection", "sidebarSection", "contextSection"].filter((key) => {
    const value = editableZones[key];
    return typeof value === "string" && value.trim().length > 0;
  }).length;
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
    reducedScope: true,
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
