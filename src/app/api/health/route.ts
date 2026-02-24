import { getEnv } from "@/lib/env";
import { jsonResponse } from "@/lib/http";
import { resolveStarterThemePath } from "@/lib/template/loader";

export async function GET() {
  const env = getEnv();
  let starterTemplateResolved = false;
  let starterTemplatePath: string | null = null;
  let starterTemplateError: string | undefined;

  try {
    starterTemplatePath = await resolveStarterThemePath();
    starterTemplateResolved = true;
  } catch (error) {
    starterTemplateError = error instanceof Error ? error.message : String(error);
  }

  return jsonResponse({
    ok: true,
    service: "themblr",
    modelConfigured: Boolean(env.openAiModel),
    fallbackModelConfigured: Boolean(env.openAiFallbackModel),
    apiKeyConfigured: Boolean(env.openAiApiKey),
    starterTemplateResolved,
    starterTemplatePath,
    starterTemplateError,
    at: new Date().toISOString(),
  });
}
