import { composeTemplate, extractZones, repairLockedZones } from "@/lib/template/zones";
import { loadStarterThemeFixture } from "@/lib/__tests__/fixtures/starter";

describe("template zones", () => {
  it("extracts editable and locked zones from starter", async () => {
    const starter = await loadStarterThemeFixture();
    const zones = extractZones(starter);

    expect(zones.editableZones.cssCore.length).toBeGreaterThan(1000);
    expect(zones.editableZones.headerSection).toContain('<header class="site-header');
    expect(zones.editableZones.sidebarSection).toContain('<aside class="site-sidebar"');
    expect(zones.lockedZoneSnapshots.length).toBe(3);
  });

  it("composes edits into template", async () => {
    const starter = await loadStarterThemeFixture();
    const result = composeTemplate({
      templateHtml: starter,
      zoneOverrides: {
        contextSection: '<section class="theme-module context-banner"><h2>Custom context</h2></section>',
      },
      metaDefaults: {
        "color:Surface": "#fafafa",
      },
    });

    expect(result.themeHtml).toContain("Custom context");
    expect(result.themeHtml).toContain('<meta name="color:Surface" content="#fafafa">');
    expect(result.changedRegions.find((x) => x.zone === "contextSection")?.changed).toBe(true);
  });

  it("merges short css overrides on top of base css to preserve contract hooks", async () => {
    const starter = await loadStarterThemeFixture();
    const result = composeTemplate({
      templateHtml: starter,
      zoneOverrides: {
        cssCore: ":root{--t-bg:#111;--t-surface:#222;}",
      },
    });

    expect(result.themeHtml).toContain("Themblr AI override");
    expect(result.themeHtml).toContain(".site-main");
    expect(result.themeHtml).toContain(".pagination");
  });

  it("repairs locked root contract when changed", async () => {
    const starter = await loadStarterThemeFixture();
    const mutated = starter.replace('data-layout="{select:Layout}"', 'data-layout="broken"');

    const repaired = repairLockedZones(starter, mutated);

    expect(repaired.repairedCount).toBe(1);
    expect(repaired.repairedHtml).toContain('data-layout="{select:Layout}"');
  });
});
