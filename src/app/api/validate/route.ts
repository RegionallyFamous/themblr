import { getEnv } from "@/lib/env";
import { jsonResponse, requestIdFromHeaders } from "@/lib/http";
import { logError, logRequest } from "@/lib/logging";
import { ValidateRequestSchema } from "@/lib/schema";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { parseJsonWithGuard, RequestGuardError } from "@/lib/security/request-guards";
import { loadStarterTemplate } from "@/lib/template/loader";
import { getClientIp } from "@/lib/utils";
import { validateThemeHtml } from "@/lib/validator";

export async function POST(request: Request) {
  const requestId = requestIdFromHeaders(request.headers);
  const startedAt = Date.now();
  const env = getEnv();
  const path = "/api/validate";

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
    const body = ValidateRequestSchema.parse(rawBody);

    const bundle = await loadStarterTemplate();
    const validation = validateThemeHtml(body.themeHtml, { baseLangKeys: bundle.baseLangKeys });

    logRequest({
      requestId,
      path,
      status: validation.passed ? "ok" : "invalid",
      durationMs: Date.now() - startedAt,
      passed: validation.passed,
    });

    return jsonResponse(validation, validation.passed ? 200 : 422, {
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
