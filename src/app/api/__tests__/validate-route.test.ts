/** @vitest-environment node */

import { beforeEach, describe, expect, it } from "vitest";

import { clearRateLimitStateForTests } from "@/lib/security/rate-limit";
import { loadStarterThemeFixture, starterThemePath } from "@/lib/__tests__/fixtures/starter";
import { POST } from "@/app/api/validate/route";

beforeEach(() => {
  clearRateLimitStateForTests();
  process.env.STARTER_THEME_PATH = starterThemePath();
  process.env.RATE_LIMIT_WINDOW_MS = "60000";
  process.env.RATE_LIMIT_MAX = "20";
});

describe("POST /api/validate", () => {
  it("returns 422 for missing required post block", async () => {
    const starter = await loadStarterThemeFixture();
    const broken = starter.replace("{block:Text}", "");

    const request = new Request("http://localhost/api/validate", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ themeHtml: broken }),
    });

    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(422);
    expect(Array.isArray(payload.errors)).toBe(true);
    expect(payload.errors.join(" ")).toContain("Missing Tumblr blocks");
  });

  it("enforces basic rate limits", async () => {
    process.env.RATE_LIMIT_MAX = "1";

    const starter = await loadStarterThemeFixture();

    const makeRequest = () =>
      new Request("http://localhost/api/validate", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": "203.0.113.12",
        },
        body: JSON.stringify({ themeHtml: starter }),
      });

    const first = await POST(makeRequest());
    expect(first.status).toBe(200);

    const second = await POST(makeRequest());
    expect(second.status).toBe(429);
  });
});
