import type { GenerateRequest } from "@/lib/schema";

const PREVIEW_COLORS = {
  pageBg: "#f7f1df",
  surface: "#fffef7",
  surfaceAlt: "#fff4ca",
  text: "#101010",
  muted: "#3a3a3a",
  accent: "#ff4d00",
  accentContrast: "#ffffff",
  border: "#101010",
  headerBg: "#ffe066",
  headerText: "#101010",
};

const PREVIEW_IMAGE = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 540"><rect width="960" height="540" fill="#ffe066"/><rect x="42" y="42" width="876" height="456" fill="#ffffff" stroke="#101010" stroke-width="20"/><text x="480" y="292" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-size="56" fill="#101010">THEMBLR PREVIEW</text></svg>',
)}`;

const PREVIEW_ICON = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#ffe066"/><rect x="8" y="8" width="48" height="48" fill="#fff" stroke="#101010" stroke-width="6"/></svg>',
)}`;

const SAMPLE_POSTS = `
<article class="post-card themblr-preview-post" data-post-id="preview-1">
  <header class="post-head">
    <a class="post-permalink" href="#">2 hours ago</a>
    <span class="post-chip">Pinned</span>
  </header>
  <h2 class="post-title"><a href="#">Default Era x Themblr Preview</a></h2>
  <div class="post-content">
    <p>This is a simulated Tumblr render so you can inspect spacing, typography, cards, and interaction affordances.</p>
    <p>Final Tumblr data, notes, and trail content will be inserted by Tumblr at runtime.</p>
  </div>
  <ul class="post-tags">
    <li><a href="#">#themblr</a></li>
    <li><a href="#">#default-era</a></li>
    <li><a href="#">#neo-brutal</a></li>
  </ul>
  <footer class="post-meta">
    <div class="post-stats"><span>42 notes</span><span>7 reblogs</span></div>
    <ul class="post-actions">
      <li><a href="#">Reblog</a></li>
      <li><a href="#">Like</a></li>
      <li><a href="#">Permalink</a></li>
    </ul>
  </footer>
</article>
<article class="post-card themblr-preview-post" data-post-id="preview-2">
  <header class="post-head">
    <a class="post-permalink" href="#">Yesterday</a>
    <span class="post-chip">Photo</span>
  </header>
  <h2 class="post-title"><a href="#">Media and Caption Behavior</a></h2>
  <div class="post-media">
    <img src="${PREVIEW_IMAGE}" alt="Preview media">
  </div>
  <div class="post-content">
    <p>Use this card to evaluate image framing, border styles, and caption rhythm.</p>
  </div>
  <footer class="post-meta">
    <div class="post-stats"><span>18 notes</span></div>
    <ul class="post-actions">
      <li><a href="#">Reblog</a></li>
      <li><a href="#">Like</a></li>
    </ul>
  </footer>
</article>
`.trim();

const SAMPLE_PAGINATION = `
<nav class="pagination" aria-label="Pages">
  <div class="pagination-links">
    <a href="#">Newer posts</a>
    <ol class="jump-pagination">
      <li><span class="current">1</span></li>
      <li><a href="#">2</a></li>
      <li><a href="#">3</a></li>
    </ol>
    <a href="#">Older posts</a>
  </div>
</nav>
`.trim();

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function replaceAllLiteral(source: string, target: string, replacement: string): string {
  return source.replace(new RegExp(escapeRegExp(target), "g"), replacement);
}

function replaceFirstBalancedBlock(source: string, blockName: string, replacement: string): string {
  const openRe = new RegExp(`\\{block:${blockName}(?:\\s[^}]*)?\\}`);
  const open = openRe.exec(source);
  if (!open) {
    return source;
  }

  const tokenRe = new RegExp(`\\{/?block:${blockName}(?:\\s[^}]*)?\\}`, "g");
  tokenRe.lastIndex = open.index;
  let depth = 0;

  for (let token = tokenRe.exec(source); token; token = tokenRe.exec(source)) {
    const isClose = token[0].startsWith("{/block:");
    depth += isClose ? -1 : 1;

    if (depth === 0) {
      const closeEnd = token.index + token[0].length;
      return `${source.slice(0, open.index)}${replacement}${source.slice(closeEnd)}`;
    }
  }

  return source;
}

function localizeLangKey(rawKey: string): string {
  const key = rawKey.trim();
  if (key.startsWith("Page CurrentPage of TotalPages")) {
    return "Page 1 of 3";
  }

  switch (key) {
    case "Newer posts":
    case "Older posts":
    case "Pages":
    case "Permalink":
    case "Search":
    case "Archive":
    case "Home":
    case "Related Posts":
    case "Tags":
    case "About":
    case "More":
    case "Likes":
    case "Following":
    case "Previous post":
    case "Next post":
    case "Powered by Tumblr":
    case "Notes":
    case "Reblogs":
      return key;
    default:
      return key.replace(/\s+\d+$/, "");
  }
}

function addPreviewOverrides(html: string): string {
  const previewStyle = `
<style id="themblr-preview-overrides">
  .themblr-preview-post { transform: rotate(0deg); }
  .themblr-preview-post + .themblr-preview-post { margin-top: 1rem; }
  .post-actions, .post-tags { list-style: none; padding-left: 0; }
  .post-actions li, .post-tags li { display: inline-flex; margin-right: 0.45rem; }
  .post-stats span { margin-right: 0.6rem; }
  .post-media img { width: 100%; height: auto; display: block; }
</style>
`;

  if (/<\/head>/i.test(html)) {
    return html.replace(/<\/head>/i, `${previewStyle}\n</head>`);
  }

  return `${previewStyle}\n${html}`;
}

function buildReplacements(request: GenerateRequest): Array<[string, string]> {
  return [
    ["{Title}", request.themeName || "Default Era"],
    ["{PostSummary}", "Live Theme Preview"],
    ["{MetaDescription}", "Themblr simulated Tumblr preview"],
    ["{Description}", "Default Era starter rendered through Themblr preview mode."],
    ["{BlogURL}", "#"],
    ["{Permalink}", "#"],
    ["{TagURL}", "#"],
    ["{NextPage}", "#"],
    ["{PreviousPage}", "#"],
    ["{PreviousPost}", "#"],
    ["{NextPost}", "#"],
    ["{SearchQuery}", "themblr"],
    ["{SearchResultCount}", "12"],
    ["{SearchResultCountWithLabel}", "12 results"],
    ["{TimeAgo}", "2 hours ago"],
    ["{DayOfMonth}", "24"],
    ["{Month}", "February"],
    ["{Year}", "2026"],
    ["{NoteCountWithLabel}", "42 notes"],
    ["{ReblogCount}", "7"],
    ["{LikeCount}", "19"],
    ["{PlayCountWithLabel}", "120 plays"],
    ["{Submitter}", "default-era"],
    ["{SubmitterURL}", "#"],
    ["{PostAuthorName}", "Default Era"],
    ["{SourceTitle}", "Themblr"],
    ["{SourceURL}", "#"],
    ["{Favicon}", PREVIEW_ICON],
    ["{RSS}", "#"],
    ["{PortraitURL-48}", PREVIEW_IMAGE],
    ["{PortraitURL-96}", PREVIEW_IMAGE],
    ["{AvatarURL-128}", PREVIEW_IMAGE],
    ["{AskerPortraitURL-48}", PREVIEW_IMAGE],
    ["{AnswererPortraitURL-48}", PREVIEW_IMAGE],
    ["{FollowedPortraitURL-48}", PREVIEW_IMAGE],
    ["{GroupMemberPortraitURL-48}", PREVIEW_IMAGE],
    ["{image:Logo}", PREVIEW_IMAGE],
    ["{image:Hero}", PREVIEW_IMAGE],
    ["{HeaderImage}", PREVIEW_IMAGE],
    ["{BlackLogoURL}", PREVIEW_IMAGE],
    ["{LogoWidth}", "120"],
    ["{LogoHeight}", "40"],
    ["{TitleFont}", "Georgia, Times New Roman, serif"],
    ['{font:Body}', 'Georgia, "Times New Roman", serif'],
    ["{font:Mono}", "Menlo, Consolas, monospace"],
    ["{BackgroundColor}", PREVIEW_COLORS.pageBg],
    ["{AccentColor}", PREVIEW_COLORS.accent],
    ["{TitleColor}", PREVIEW_COLORS.headerText],
    ["{color:Page Background}", PREVIEW_COLORS.pageBg],
    ["{color:Surface}", PREVIEW_COLORS.surface],
    ["{color:Surface Alt}", PREVIEW_COLORS.surfaceAlt],
    ["{color:Text}", PREVIEW_COLORS.text],
    ["{color:Muted Text}", PREVIEW_COLORS.muted],
    ["{color:Accent}", PREVIEW_COLORS.accent],
    ["{color:Accent Contrast}", PREVIEW_COLORS.accentContrast],
    ["{color:Border}", PREVIEW_COLORS.border],
    ["{color:Header Background}", PREVIEW_COLORS.headerBg],
    ["{color:Header Text}", PREVIEW_COLORS.headerText],
    ["{RGBcolor:Header Background}", "255, 224, 102"],
    ["{RGBcolor:Header Text}", "16, 16, 16"],
    ["{RGBcolor:Border}", "16, 16, 16"],
    ["{RGBcolor:Surface}", "255, 254, 247"],
    ["{RGBcolor:Surface Alt}", "255, 244, 202"],
    ["{RGBcolor:Accent}", "255, 77, 0"],
    ["{select:Layout}", request.structured.layout],
    ["{select:Post Width}", request.structured.postWidth],
    ["{select:Card Style}", request.structured.cardStyle],
    ["{select:Header Alignment}", request.structured.headerAlignment],
    ["{select:Notes Avatar Size}", request.structured.notesAvatarSize],
    ["{text:Subtitle}", "Preview Mode"],
    ["{text:Footer Note}", "Rendered via fake Tumblr install"],
    ["{text:CTA Label}", "Read more"],
    ["{text:CTA URL}", "#"],
    ["{CustomCSS}", ""],
  ];
}

export function buildFakeTumblrPreviewHtml(themeHtml: string, request: GenerateRequest): string {
  let html = themeHtml;

  html = replaceFirstBalancedBlock(html, "Posts", SAMPLE_POSTS);
  html = replaceFirstBalancedBlock(html, "Pagination", SAMPLE_PAGINATION);
  html = replaceFirstBalancedBlock(html, "PermalinkPagination", "");
  html = replaceFirstBalancedBlock(html, "RelatedPosts", "");

  html = html.replace(/\{\/?block:[^}\n]+\}/g, "");
  html = html.replace(/\{lang:([^}\n]+)\}/g, (_m: string, key: string) => localizeLangKey(key));

  for (const [token, replacement] of buildReplacements(request)) {
    html = replaceAllLiteral(html, token, replacement);
  }

  html = html.replace(/\{(?:PhotoURL(?:-HighRes|-\d+)?|PanoramaURL(?:-\d+)?|LinkOpenTag|LinkCloseTag)\}/g, PREVIEW_IMAGE);
  html = html.replace(/\{(?:Photoset-700|PhotoAlt)\}/g, PREVIEW_IMAGE);
  html = html.replace(/\{(?:Video-700|Video-500)\}/g, '<div class="post-media"><img src="' + PREVIEW_IMAGE + '" alt="Video placeholder"></div>');
  html = html.replace(/\{AudioEmbed\}/g, '<div class="post-media"><img src="' + PREVIEW_IMAGE + '" alt="Audio placeholder"></div>');
  html = html.replace(/\{[A-Za-z][^}\n]*\}/g, "");

  return addPreviewOverrides(html);
}
