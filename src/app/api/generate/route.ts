import { getEnv } from "@/lib/env";
import { generateThemeFromStarter } from "@/lib/generation";
import { jsonResponse, requestIdFromHeaders } from "@/lib/http";
import { logError, logRequest } from "@/lib/logging";
import { GenerateRequestSchema } from "@/lib/schema";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { enforcePromptLimit, parseJsonWithGuard, RequestGuardError } from "@/lib/security/request-guards";
import { loadStarterTemplate } from "@/lib/template/loader";
import { getClientIp } from "@/lib/utils";

function mapGenerateError(error: unknown): { status: number; message: string } | null {
  if (!(error instanceof Error)) {
    return null;
  }

  const normalizedMessage = error.message.trim().toLowerCase();

  if (error.name === "ZodError") {
    return {
      status: 502,
      message: "OpenAI returned an invalid response format. Retry shortly.",
    };
  }

  if (error.name === "AbortError") {
    return {
      status: 504,
      message: "Generation timed out. Try a shorter prompt or increase GENERATION_TIMEOUT_MS.",
    };
  }

  if (normalizedMessage.includes("request was aborted")) {
    return {
      status: 504,
      message: "Generation timed out. Try a shorter prompt or increase GENERATION_TIMEOUT_MS.",
    };
  }

  if (normalizedMessage.includes("openai returned non-json output")) {
    return {
      status: 502,
      message: "OpenAI returned an unreadable response. Retry shortly.",
    };
  }

  if (error.message.includes("Unable to locate starter theme.html")) {
    return {
      status: 500,
      message:
        "Starter template not found. Set STARTER_THEME_PATH to a valid theme.html path available in this deployment.",
    };
  }

  if (error.message === "OPENAI_API_KEY is missing" || error.message === "OPENAI_MODEL is missing") {
    return {
      status: 500,
      message: error.message,
    };
  }

  const openAiStatus = (error as { status?: unknown }).status;
  if (typeof openAiStatus === "number") {
    if (openAiStatus === 401 || openAiStatus === 403) {
      return {
        status: 502,
        message: "OpenAI request failed authentication. Check OPENAI_API_KEY.",
      };
    }

    if (openAiStatus === 429) {
      return {
        status: 503,
        message: "OpenAI rate limit reached. Retry shortly.",
      };
    }

    if (openAiStatus >= 500) {
      return {
        status: 502,
        message: "OpenAI service is temporarily unavailable. Retry shortly.",
      };
    }

    return {
      status: 502,
      message: `OpenAI request failed (${openAiStatus}).`,
    };
  }

  return null;
}

export async function POST(request: Request) {
  const requestId = requestIdFromHeaders(request.headers);
  const startedAt = Date.now();
  const env = getEnv();
  const path = "/api/generate";
  const baseHeaders = { "x-request-id": requestId };

  try {
    const ip = getClientIp(request.headers);
    const rate = checkRateLimit(ip, env.rateLimitMax, env.rateLimitWindowMs);
    if (!rate.allowed) {
      logRequest({ requestId, path, status: "rate_limited", durationMs: Date.now() - startedAt });
      return jsonResponse(
        { ok: false, error: "Rate limit exceeded", resetAt: rate.resetAt, requestId },
        429,
        { ...baseHeaders, "x-ratelimit-remaining": String(rate.remaining) },
      );
    }

    const rawBody = await parseJsonWithGuard<unknown>(request);
    const parsedBody = GenerateRequestSchema.safeParse(rawBody);
    if (!parsedBody.success) {
      return jsonResponse(
        { ok: false, error: "Invalid request schema", requestId },
        400,
        baseHeaders,
      );
    }

    const body = parsedBody.data;
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
      ...baseHeaders,
      "x-ratelimit-remaining": String(rate.remaining),
    });
  } catch (error) {
    logError(requestId, path, error);

    if (error instanceof RequestGuardError) {
      return jsonResponse({ ok: false, error: error.message, requestId }, error.status, baseHeaders);
    }

    const mappedError = mapGenerateError(error);
    if (mappedError) {
      return jsonResponse({ ok: false, error: mappedError.message, requestId }, mappedError.status, baseHeaders);
    }

    return jsonResponse({ ok: false, error: "Internal server error", requestId }, 500, baseHeaders);
  }
}
