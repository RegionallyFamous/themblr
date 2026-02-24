import { beforeEach, describe, expect, it, vi } from "vitest";

import { generateThemeFromStarter } from "@/lib/generation";
import { sha256 } from "@/lib/utils";
import { loadStarterThemeFixture, starterThemePath } from "@/lib/__tests__/fixtures/starter";
import type { GenerateRequest } from "@/lib/schema";

vi.mock("@/lib/openai/generate", () => ({
  generateEditableOverridesWithOpenAI: vi.fn(),
}));

import { generateEditableOverridesWithOpenAI } from "@/lib/openai/generate";

const mockedGenerate = vi.mocked(generateEditableOverridesWithOpenAI);

const request: GenerateRequest = {
  themeName: "Test Theme",
  slug: "test-theme",
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
    tone: "Clean",
    paletteHint: "Neutral",
  },
  prompt: "Make it bold",
};

beforeEach(() => {
  mockedGenerate.mockReset();
  process.env.OPENAI_MODEL = "test-model";
  process.env.OPENAI_API_KEY = "test-key";
});

describe("generateThemeFromStarter", () => {
  it("returns valid theme with mocked model output", async () => {
    const starter = await loadStarterThemeFixture();
    const baseCssCore = starter.match(/<style>([\s\S]*?)\{CustomCSS\}/)?.[1]?.trim() || "";

    mockedGenerate.mockResolvedValue({
      editableZones: {
        cssCore: `${baseCssCore}\n\n.ai-context { border: 1px solid red; }`,
      },
      metaDefaults: {
        "color:Surface": "#f8f8f8",
      },
      notes: [],
    });

    const result = await generateThemeFromStarter(request, {
      templatePath: starterThemePath(),
      templateHtml: starter,
      templateHash: sha256(starter),
      baseLangKeys: [],
    });

    expect(result.validation.passed).toBe(true);
    expect(result.themeHtml).toContain(".ai-context");
  });

  it("auto-repairs by reverting risky editable zones and passes", async () => {
    const starter = await loadStarterThemeFixture();

    mockedGenerate.mockResolvedValue({
      editableZones: {
        headerSection: "<header>broken</header>",
        contextSection: "<div>bad</div>",
      },
      metaDefaults: {},
      notes: [],
    });

    const result = await generateThemeFromStarter(request, {
      templatePath: starterThemePath(),
      templateHtml: starter,
      templateHash: sha256(starter),
      baseLangKeys: [],
    });

    expect(result.validation.passed).toBe(true);
    expect(result.report.lockedRegionsRepaired).toBeGreaterThan(0);
  });

  it("triggers retry path when first output remains invalid", async () => {
    const starter = await loadStarterThemeFixture();

    mockedGenerate
      .mockResolvedValueOnce({
        editableZones: {
          cssCore: ".oops { color: red; }",
        },
        metaDefaults: {
          "color:Surface": "",
        },
        notes: [],
      })
      .mockResolvedValueOnce({
        editableZones: {
          cssCore: starter.match(/<style>([\s\S]*?)\{CustomCSS\}/)?.[1] || "",
        },
        metaDefaults: {},
        notes: ["corrective pass"],
      });

    const result = await generateThemeFromStarter(request, {
      templatePath: starterThemePath(),
      templateHtml: starter,
      templateHash: sha256(starter),
      baseLangKeys: [],
    });

    expect(result.report.retryCount).toBe(1);
    expect(result.validation.passed).toBe(true);
  });
});
