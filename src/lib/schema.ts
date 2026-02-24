import { z } from "zod";

const ToggleSchema = z.object({
  showSidebar: z.boolean(),
  showSearch: z.boolean(),
  showFeaturedTags: z.boolean(),
  showFollowing: z.boolean(),
  showLikesWidget: z.boolean(),
  showRelatedPosts: z.boolean(),
  showFooter: z.boolean(),
  enableMotion: z.boolean(),
});

export const StructuredInputSchema = z.object({
  layout: z.enum(["stream", "split", "grid"]),
  postWidth: z.enum(["compact", "regular", "wide"]),
  cardStyle: z.enum(["outlined", "elevated", "minimal"]),
  headerAlignment: z.enum(["left", "center"]),
  notesAvatarSize: z.enum(["small", "large"]),
  toggles: ToggleSchema,
  tone: z.string().min(1).max(120),
  paletteHint: z.string().min(1).max(220),
});

export const GenerateRequestSchema = z.object({
  themeName: z.string().min(1).max(120),
  slug: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug must be kebab-case"),
  structured: StructuredInputSchema,
  prompt: z.string().min(1).max(20_000),
});

export const ValidateRequestSchema = z.object({
  themeHtml: z.string().min(1),
});

export const EditableZonesSchema = z
  .object({
    cssCore: z.string().optional(),
    headerSection: z.string().optional(),
    sidebarSection: z.string().optional(),
    contextSection: z.string().optional(),
  })
  .default({});

export const AiGenerationSchema = z.object({
  editableZones: EditableZonesSchema,
  metaDefaults: z.record(z.string(), z.string()).default({}),
  notes: z.array(z.string()).default([]),
});

export const ValidationCheckSchema = z.object({
  id: z.string(),
  passed: z.boolean(),
  severity: z.enum(["error", "warning"]),
  message: z.string(),
  details: z.array(z.string()).optional(),
});

export const ValidationResultSchema = z.object({
  passed: z.boolean(),
  errors: z.array(z.string()),
  warnings: z.array(z.string()),
  checks: z.array(ValidationCheckSchema),
});

export const GenerateReportSchema = z.object({
  lockedRegionsRepaired: z.number().int().nonnegative(),
  retryCount: z.number().int().nonnegative(),
  changedRegions: z.array(
    z.object({
      zone: z.string(),
      changed: z.boolean(),
      oldChars: z.number().int().nonnegative(),
      newChars: z.number().int().nonnegative(),
    }),
  ),
});

export const GenerateResponseSchema = z.object({
  ok: z.boolean(),
  fileName: z.string(),
  themeHtml: z.string(),
  validation: ValidationResultSchema,
  report: GenerateReportSchema,
});

export const PresetSchema = z.object({
  version: z.literal("1.0"),
  name: z.string().min(1).max(80),
  updatedAt: z.string().datetime(),
  data: GenerateRequestSchema,
});

export type StructuredInput = z.infer<typeof StructuredInputSchema>;
export type GenerateRequest = z.infer<typeof GenerateRequestSchema>;
export type ValidateRequest = z.infer<typeof ValidateRequestSchema>;
export type AiGeneration = z.infer<typeof AiGenerationSchema>;
export type ValidationCheck = z.infer<typeof ValidationCheckSchema>;
export type ValidationResult = z.infer<typeof ValidationResultSchema>;
export type GenerateReport = z.infer<typeof GenerateReportSchema>;
export type GenerateResponse = z.infer<typeof GenerateResponseSchema>;
export type Preset = z.infer<typeof PresetSchema>;
