import { PresetSchema } from "@/lib/schema";

const validPreset = {
  version: "1.0",
  name: "Editorial",
  updatedAt: new Date().toISOString(),
  data: {
    themeName: "Editorial",
    slug: "editorial",
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
    prompt: "Make it elegant",
  },
};

describe("PresetSchema", () => {
  it("accepts valid presets", () => {
    const parsed = PresetSchema.parse(validPreset);
    expect(parsed.name).toBe("Editorial");
  });

  it("rejects invalid version", () => {
    expect(() => PresetSchema.parse({ ...validPreset, version: "2.0" })).toThrow();
  });
});
