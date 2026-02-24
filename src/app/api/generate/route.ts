import { getEnv } from "@/lib/env";
import { generateThemeFromStarter } from "@/lib/generation";
import { jsonResponse, requestIdFromHeaders } from "@/lib/http";
import { logError, logRequest } from "@/lib/logging";
import { GenerateRequestSchema } from "@/lib/schema";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { enforcePromptLimit, parseJsonWithGuard, RequestGuardError } from "@/lib/security/request-guards";
import { loadStarterTemplate } from "@/lib/template/loader";
import { getClientIp } from "@/lib/utils";

export async function POST(request: Request) {
  const requestId = requestIdFromHeaders(request.headers);
  const startedAt = Date.now();
  const env = getEnv();
  const path = "/api/generate";

  try {
    const ip = getClientIp(request.headers);
    const rate = checkRateLimit(ip, env.rateLimitMax, env.rateLimitWindowMs);
    if (!rate.allowed) {
      logRequest({ requestId, path, status: "rate_limited", durationMs: Date.now() - startedAt });
      return jsonResponse(
        { ok: false, error: "Rate limit exceeded", resetAt: rate.resetAt },
        429,
        { "x-ratelimit-remaining": String(rate.remaining) },
      );
    }

    const rawBody = await parseJsonWithGuard<unknown>(request);
    const body = GenerateRequestSchema.parse(rawBody);
    enforcePromptLimit(body.prompt);

    const bundle = await loadStarterTemplate();
    const result = await generateThemeFromStarter(body, bundle);

    const status = result.validation.passed ? 200 : 422;

    logRequest({
      requestId,
      path,
      status: result.validation.passed ? "ok" : "invalid",
      durationMs: Date.now() - startedAt,
      retryCount: result.report.retryCount,
      passed: result.validation.passed,
    });

    return jsonResponse(result, status, {
      "x-ratelimit-remaining": String(rate.remaining),
    });
  } catch (error) {
    logError(requestId, path, error);

    if (error instanceof RequestGuardError) {
      return jsonResponse({ ok: false, error: error.message }, error.status);
    }

    if (error instanceof Error && error.name === "ZodError") {
      return jsonResponse({ ok: false, error: "Invalid request schema" }, 400);
    }

    return jsonResponse({ ok: false, error: "Internal server error" }, 500);
  }
}
