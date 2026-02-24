import { buildThemeFileName, normalizeSlug } from "@/lib/utils";

describe("utils", () => {
  it("normalizes slug", () => {
    expect(normalizeSlug("  My Big Theme!!  ")).toBe("my-big-theme");
  });

  it("builds file name using slug and date", () => {
    const fileName = buildThemeFileName("My Theme");
    expect(fileName).toMatch(/^my-theme-\d{4}-\d{2}-\d{2}-theme\.html$/);
  });
});
