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

function validGenerateBody() {
  return {
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
  };
}

function makeRequest(body: unknown, ip = "127.0.0.1"): Request {
  return new Request("http://localhost/api/generate", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": ip,
    },
    body: JSON.stringify(body),
  });
}

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

    const request = makeRequest(validGenerateBody());

    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.fileName).toContain("test-theme");
  });

  it("returns 422 when generated theme fails validation", async () => {
    mockedGenerateThemeFromStarter.mockResolvedValue({
      ok: true,
      fileName: "invalid-2026-02-24-theme.html",
      themeHtml: "<html></html>",
      validation: {
        passed: false,
        errors: ["Missing block"],
        warnings: [],
        checks: [],
      },
      report: {
        lockedRegionsRepaired: 0,
        retryCount: 1,
        changedRegions: [],
      },
    });

    const response = await POST(makeRequest(validGenerateBody()));
    const payload = await response.json();

    expect(response.status).toBe(422);
    expect(payload.ok).toBe(true);
    expect(payload.validation.passed).toBe(false);
  });

  it("returns 400 for invalid request schema", async () => {
    const response = await POST(makeRequest({ themeName: 123 }));
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.ok).toBe(false);
    expect(payload.error).toBe("Invalid request schema");
  });

  it("returns 429 when rate limit is exceeded", async () => {
    process.env.RATE_LIMIT_MAX = "1";
    mockedGenerateThemeFromStarter.mockResolvedValue({
      ok: true,
      fileName: "ok-2026-02-24-theme.html",
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
    });

    const ip = "203.0.113.10";
    const first = await POST(makeRequest(validGenerateBody(), ip));
    const second = await POST(makeRequest(validGenerateBody(), ip));
    const payload = await second.json();

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
    expect(payload.ok).toBe(false);
    expect(payload.error).toBe("Rate limit exceeded");
  });

  it("maps generation config errors and returns request id", async () => {
    mockedGenerateThemeFromStarter.mockRejectedValue(new Error("OPENAI_MODEL is missing"));

    const response = await POST(makeRequest(validGenerateBody()));
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(response.headers.get("x-request-id")).toBeTruthy();
    expect(payload.ok).toBe(false);
    expect(payload.error).toBe("OPENAI_MODEL is missing");
    expect(payload.requestId).toBeTruthy();
  });

  it("maps aborted OpenAI requests to timeout response", async () => {
    mockedGenerateThemeFromStarter.mockRejectedValue(new Error("Request was aborted."));

    const response = await POST(makeRequest(validGenerateBody()));
    const payload = await response.json();

    expect(response.status).toBe(504);
    expect(payload.ok).toBe(false);
    expect(payload.error).toBe("Generation timed out. Try a shorter prompt or increase GENERATION_TIMEOUT_MS.");
    expect(payload.requestId).toBeTruthy();
  });

  it("maps invalid model response shape errors to 502", async () => {
    const invalidShapeError = new Error("invalid schema");
    invalidShapeError.name = "ZodError";
    mockedGenerateThemeFromStarter.mockRejectedValue(invalidShapeError);

    const response = await POST(makeRequest(validGenerateBody()));
    const payload = await response.json();

    expect(response.status).toBe(502);
    expect(payload.ok).toBe(false);
    expect(payload.error).toBe("OpenAI returned an invalid response format. Retry shortly.");
    expect(payload.requestId).toBeTruthy();
  });
});
