import { validateThemeHtml } from "@/lib/validator";
import { loadStarterThemeFixture } from "@/lib/__tests__/fixtures/starter";

describe("validator", () => {
  it("passes starter theme contract", async () => {
    const starter = await loadStarterThemeFixture();
    const validation = validateThemeHtml(starter);

    expect(validation.passed).toBe(true);
    expect(validation.errors).toHaveLength(0);
  });

  it("fails when required block is missing", async () => {
    const starter = await loadStarterThemeFixture();
    const mutated = starter.replace("{block:Text}", "");

    const validation = validateThemeHtml(mutated);

    expect(validation.passed).toBe(false);
    expect(validation.errors.some((error) => error.includes("Missing Tumblr blocks"))).toBe(true);
  });

  it("detects block imbalance", async () => {
    const starter = await loadStarterThemeFixture();
    const mutated = starter.replace("{/block:Text}", "");

    const validation = validateThemeHtml(mutated);

    expect(validation.passed).toBe(false);
    expect(validation.errors.some((error) => error.includes("Block balance errors"))).toBe(true);
  });

  it("runs quickly on starter-size theme", async () => {
    const starter = await loadStarterThemeFixture();

    const started = Date.now();
    const validation = validateThemeHtml(starter);
    const duration = Date.now() - started;

    expect(validation.passed).toBe(true);
    expect(duration).toBeLessThan(1000);
  });
});
