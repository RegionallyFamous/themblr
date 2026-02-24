/** @vitest-environment node */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { clearRateLimitStateForTests } from "@/lib/security/rate-limit";
import type { GenerateResponse } from "@/lib/schema";
import { starterThemePath } from "@/lib/__tests__/fixtures/starter";

vi.mock("@/lib/generation", () => ({
  generateThemeFromStarter: vi.fn(),
}));

import { generateThemeFromStarter } from "@/lib/generation";
import { POST } from "@/app/api/generate/route";

const mockedGenerateThemeFromStarter = vi.mocked(generateThemeFromStarter);

beforeEach(() => {
  clearRateLimitStateForTests();
  mockedGenerateThemeFromStarter.mockReset();
  process.env.RATE_LIMIT_MAX = "20";
  process.env.RATE_LIMIT_WINDOW_MS = "60000";
  process.env.MAX_PROMPT_CHARS = "5000";
  process.env.OPENAI_MODEL = "mock-model";
  process.env.OPENAI_API_KEY = "mock-key";
  process.env.STARTER_THEME_PATH = starterThemePath();
});

describe("POST /api/generate", () => {
  it("returns generated payload", async () => {
    const mocked: GenerateResponse = {
      ok: true,
      fileName: "test-theme-2026-02-24-theme.html",
      themeHtml: "<html></html>",
      validation: {
        passed: true,
        errors: [],
        warnings: [],
        checks: [],
      },
      report: {
        lockedRegionsRepaired: 0,
        retryCount: 0,
        changedRegions: [],
      },
    };

    mockedGenerateThemeFromStarter.mockResolvedValue(mocked);

    const request = new Request("http://localhost/api/generate", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        themeName: "T",
        slug: "t",
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
          tone: "clean",
          paletteHint: "neutral",
        },
        prompt: "hello",
      }),
    });

    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.fileName).toContain("test-theme");
  });
});
