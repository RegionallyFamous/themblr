export const THEMBLR_SCHEMA_VERSION = "themblr-schema-version-1.0";

export const REQUIRED_META_OPTION_NAMES = [
  "color:Page Background",
  "color:Surface",
  "color:Surface Alt",
  "color:Text",
  "color:Muted Text",
  "color:Accent",
  "color:Accent Contrast",
  "color:Border",
  "color:Header Background",
  "color:Header Text",
  "font:Heading",
  "font:Body",
  "font:Mono",
  "if:Show Sidebar",
  "if:Sticky Header",
  "if:Show Search",
  "if:Show Featured Tags",
  "if:Show Following",
  "if:Show Likes Widget",
  "if:Show Related Posts",
  "if:Use Jump Pagination",
  "if:Show Footer",
  "if:Enable Motion",
  "select:Layout",
  "select:Post Width",
  "select:Card Style",
  "select:Header Alignment",
  "select:Notes Avatar Size",
  "text:Subtitle",
  "text:Footer Note",
  "text:CTA Label",
  "text:CTA URL",
  "image:Logo",
  "image:Hero",
  "image:Background Texture",
] as const;

export const REQUIRED_ROOT_DATA_ATTRS = ["data-layout", "data-width", "data-card"] as const;

export const REQUIRED_STABLE_HOOKS = [
  ".site-shell",
  ".site-header",
  ".site-main",
  ".site-sidebar",
  ".post-card",
  ".post-meta",
  ".reblog-list",
  ".pagination",
  ".theme-module",
] as const;

export const REQUIRED_CSS_VARIABLES = [
  "--t-bg",
  "--t-surface",
  "--t-text",
  "--t-muted",
  "--t-accent",
  "--t-border",
  "--t-radius",
  "--t-gap",
  "--t-max-post",
] as const;

export const REQUIRED_JS_SIGNATURES = [
  "ThemeStarter.init = function",
  "ThemeStarter.refreshLikeButtons = function",
  "window.ThemeStarter = ThemeStarter",
  "window.tumblrNotesLoaded = function",
  "window.tumblrNotesInserted = function",
] as const;

export const REQUIRED_TUMBLR_BLOCKS = [
  "Text",
  "Answer",
  "Photo",
  "Panorama",
  "Photoset",
  "Quote",
  "Link",
  "Chat",
  "Audio",
  "Video",
  "NotReblog",
  "RebloggedFrom",
  "Reblogs",
  "Pagination",
  "PermalinkPagination",
  "SearchPage",
  "NoSearchResults",
  "RelatedPosts",
] as const;

export const RECOMMENDED_LANG_KEYS = [
  "{lang:Search}",
  "{lang:Archive}",
  "{lang:Home}",
  "{lang:Pages}",
  "{lang:Permalink}",
] as const;

export const EDITABLE_ZONE_KEYS = [
  "cssCore",
  "headerSection",
  "sidebarSection",
  "contextSection",
] as const;

export type EditableZoneKey = (typeof EDITABLE_ZONE_KEYS)[number];

export const LOCKED_ZONE_KEYS = [
  "postRenderCore",
  "jsCore",
  "rootContract",
] as const;

export type LockedZoneKey = (typeof LOCKED_ZONE_KEYS)[number];

export const REQUIRED_VALIDATION_CHECK_IDS = [
  "required-meta-options",
  "required-root-attrs",
  "required-stable-hooks",
  "required-css-vars",
  "required-js-signatures",
  "required-tumblr-blocks",
  "block-balance",
  "disallow-external-script-src",
  "disallow-external-css-import",
  "disallow-external-font-cdn",
  "customcss-inside-style",
] as const;

export const MAX_THEME_BYTES_WARNING = 300_000;
export const MAX_INLINE_SCRIPT_WARNING_CHARS = 40_000;

export const DEFAULT_ENV = {
  RATE_LIMIT_WINDOW_MS: 60_000,
  RATE_LIMIT_MAX: 20,
  GENERATION_TIMEOUT_MS: 20_000,
  MAX_PROMPT_CHARS: 3_500,
  MAX_REQUEST_BYTES: 120_000,
};
