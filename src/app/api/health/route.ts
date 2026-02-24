import { getEnv } from "@/lib/env";
import { jsonResponse } from "@/lib/http";

export async function GET() {
  const env = getEnv();

  return jsonResponse({
    ok: true,
    service: "themblr",
    modelConfigured: Boolean(env.openAiModel),
    apiKeyConfigured: Boolean(env.openAiApiKey),
    at: new Date().toISOString(),
  });
}
