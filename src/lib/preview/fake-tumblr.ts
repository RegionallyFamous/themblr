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
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 540"><rect width="960" height="540" fill="#ffe066"/><rect x="42" y="42" width="876" height="456" fill="#ffffff" stroke="#101010" stroke-width="20"/><text x="480" y="292" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-size="56" fill="#101010">DEFAULT ERA</text></svg>',
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
  <h2 class="post-title"><a href="#">Default Era Launch Notes</a></h2>
  <div class="post-content">
    <p>Default Era is a flexible base built for readable posts, strong hierarchy, and clean spacing across post types.</p>
    <p>Use this page to review cards, typography rhythm, media framing, and action affordances before publishing.</p>
  </div>
  <ul class="post-tags">
    <li><a href="#">#tumblr-theme</a></li>
    <li><a href="#">#default-era</a></li>
    <li><a href="#">#design-system</a></li>
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

interface BalancedBlockRange {
  start: number;
  end: number;
  innerStart: number;
  innerEnd: number;
}

function findFirstBalancedBlock(source: string, blockName: string, fromIndex = 0): BalancedBlockRange | null {
  const openRe = new RegExp(`\\{block:${blockName}(?:\\s[^}]*)?\\}`, "g");
  openRe.lastIndex = fromIndex;
  const open = openRe.exec(source);
  if (!open) {
    return null;
  }

  const tokenRe = new RegExp(`\\{/?block:${blockName}(?:\\s[^}]*)?\\}`, "g");
  tokenRe.lastIndex = open.index;
  let depth = 0;

  for (let token = tokenRe.exec(source); token; token = tokenRe.exec(source)) {
    const isClose = token[0].startsWith("{/block:");
    depth += isClose ? -1 : 1;

    if (depth === 0) {
      const closeEnd = token.index + token[0].length;
      return {
        start: open.index,
        end: closeEnd,
        innerStart: open.index + open[0].length,
        innerEnd: token.index,
      };
    }
  }

  return null;
}

function replaceFirstBalancedBlock(source: string, blockName: string, replacement: string): string {
  const range = findFirstBalancedBlock(source, blockName);
  if (!range) {
    return source;
  }

  return `${source.slice(0, range.start)}${replacement}${source.slice(range.end)}`;
}

function replaceAllBalancedBlocks(source: string, blockName: string, transform: (inner: string) => string): string {
  let html = source;
  let cursor = 0;

  while (true) {
    const range = findFirstBalancedBlock(html, blockName, cursor);
    if (!range) {
      break;
    }

    const inner = html.slice(range.innerStart, range.innerEnd);
    const replacement = transform(inner);
    html = `${html.slice(0, range.start)}${replacement}${html.slice(range.end)}`;
    cursor = range.start + replacement.length;
  }

  return html;
}

function applyPreviewBlockDecisions(html: string, request: GenerateRequest): string {
  const includeBlocks = new Set<string>([
    "Description",
    "IfShowSidebar",
    "IfShowSearch",
    "IfStickyHeader",
    "ShowHeaderImage",
    "AskEnabled",
    "SubmissionsEnabled",
    "HasPages",
    "Pages",
    "Pagination",
    "PreviousPage",
    "NextPage",
    "IfUseJumpPagination",
    "JumpPagination",
    "CurrentPage",
    "JumpPage",
    "IfShowFeaturedTags",
    "HasFeaturedTags",
    "FeaturedTags",
    "IfShowFooter",
    "IfFooterNote",
    "IfCTALabel",
    "IfCTAURL",
  ]);

  const excludeBlocks = new Set<string>([
    "SearchPage",
    "NoSearchResults",
    "TagPage",
    "DayPage",
    "DayPagination",
    "PermalinkPagination",
    "PermalinkPage",
    "IfShowRelatedPosts",
    "IfRelatedPosts",
    "RelatedPosts",
    "IfNotUseJumpPagination",
    "IfShowFollowing",
    "Following",
    "Followed",
    "IfShowLikesWidget",
    "Likes",
    "NoLikes",
    "GroupMembers",
    "GroupMember",
  ]);

  if (!request.structured.toggles.enableMotion) {
    includeBlocks.add("IfNotEnableMotion");
  } else {
    excludeBlocks.add("IfNotEnableMotion");
  }

  let output = html;

  for (const blockName of includeBlocks) {
    output = replaceAllBalancedBlocks(output, blockName, (inner) => inner);
  }

  for (const blockName of excludeBlocks) {
    output = replaceAllBalancedBlocks(output, blockName, () => "");
  }

  return output;
}

function cleanupPreviewMarkup(html: string): string {
  let output = html;
  output = output.replace(/<a([^>]*)href=(['"])\2([^>]*)>\s*<\/a>/gi, "");
  output = output.replace(/<li[^>]*>\s*<\/li>/gi, "");
  output = output.replace(/<ul[^>]*>\s*<\/ul>/gi, "");
  output = output.replace(/<ol[^>]*>\s*<\/ol>/gi, "");
  output = output.replace(/<p>\s*<\/p>/gi, "");
  output = output.replace(/\n{3,}/g, "\n\n");

  return output;
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
    ["{PostSummary}", "Tumblr theme demo"],
    ["{MetaDescription}", "Default Era Tumblr theme demo"],
    ["{Description}", "Default Era starter rendered with sample Tumblr content."],
    ["{BlogURL}", "#"],
    ["{Permalink}", "#"],
    ["{TagURL}", "#"],
    ["{URL}", "#"],
    ["{AskLabel}", "Ask"],
    ["{SubmitLabel}", "Submit"],
    ["{Label}", "Archive"],
    ["{PageNumber}", "1"],
    ["{CurrentPage}", "1"],
    ["{TotalPages}", "3"],
    ["{Tag}", "tumblr-theme"],
    ["{NextPage}", "#"],
    ["{PreviousPage}", "#"],
    ["{PreviousPost}", "#"],
    ["{NextPost}", "#"],
    ["{SearchQuery}", "default era"],
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
    ["{FollowedName}", "default-era"],
    ["{FollowedTitle}", "Default Era"],
    ["{FollowedURL}", "#"],
    ["{GroupMemberName}", "default-era-studio"],
    ["{GroupMemberTitle}", "Default Era Studio"],
    ["{GroupMemberURL}", "#"],
    ["{Username}", "default-era"],
    ["{SourceTitle}", "Default Era"],
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
    ["{text:Subtitle}", "Tumblr theme starter"],
    ["{text:Footer Note}", "Built with Default Era"],
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
  html = applyPreviewBlockDecisions(html, request);

  html = html.replace(/\{lang:([^}\n]+)\}/g, (_m: string, key: string) => localizeLangKey(key));

  for (const [token, replacement] of buildReplacements(request)) {
    html = replaceAllLiteral(html, token, replacement);
  }

  html = html.replace(/\{(?:PhotoURL(?:-HighRes|-\d+)?|PanoramaURL(?:-\d+)?|LinkOpenTag|LinkCloseTag)\}/g, PREVIEW_IMAGE);
  html = html.replace(/\{(?:Photoset-700|PhotoAlt)\}/g, PREVIEW_IMAGE);
  html = html.replace(/\{(?:Video-700|Video-500)\}/g, '<div class="post-media"><img src="' + PREVIEW_IMAGE + '" alt="Video placeholder"></div>');
  html = html.replace(/\{AudioEmbed\}/g, '<div class="post-media"><img src="' + PREVIEW_IMAGE + '" alt="Audio placeholder"></div>');
  html = html.replace(/\{\/?block:[^}\n]+\}/g, "");
  html = html.replace(/\{[A-Za-z][^}\n]*\}/g, "");
  html = cleanupPreviewMarkup(html);

  return addPreviewOverrides(html);
}
