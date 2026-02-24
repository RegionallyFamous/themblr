import { describe, expect, it } from "vitest";

import { buildFakeTumblrPreviewHtml } from "@/lib/preview/fake-tumblr";
import type { GenerateRequest } from "@/lib/schema";
import { loadStarterThemeFixture } from "@/lib/__tests__/fixtures/starter";

const request: GenerateRequest = {
  themeName: "Default Era",
  slug: "default-era",
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
    tone: "Bold",
    paletteHint: "High contrast",
  },
  prompt: "Preview test",
};

describe("buildFakeTumblrPreviewHtml", () => {
  it("renders sample posts and strips Tumblr block tokens", async () => {
    const starter = await loadStarterThemeFixture();
    const preview = buildFakeTumblrPreviewHtml(starter, request);

    expect(preview).toContain("themblr-preview-post");
    expect(preview).toContain("Tumblr theme demo");
    expect(preview).toContain("Default Era Launch Notes");
    expect(preview).not.toContain("{block:Posts");
    expect(preview).not.toContain("{/block:Posts}");
  });
});
