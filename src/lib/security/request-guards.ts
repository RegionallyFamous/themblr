import { getEnv } from "@/lib/env";

export class RequestGuardError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export async function parseJsonWithGuard<T>(request: Request): Promise<T> {
  const env = getEnv();
  const contentLength = request.headers.get("content-length");

  if (contentLength) {
    const bytes = Number.parseInt(contentLength, 10);
    if (Number.isFinite(bytes) && bytes > env.maxRequestBytes) {
      throw new RequestGuardError(`Request body exceeds ${env.maxRequestBytes} bytes`, 413);
    }
  }

  const rawBody = await request.text();
  const rawBytes = Buffer.byteLength(rawBody, "utf8");
  if (rawBytes > env.maxRequestBytes) {
    throw new RequestGuardError(`Request body exceeds ${env.maxRequestBytes} bytes`, 413);
  }

  try {
    return JSON.parse(rawBody) as T;
  } catch {
    throw new RequestGuardError("Invalid JSON body", 400);
  }
}

export function enforcePromptLimit(prompt: string) {
  const env = getEnv();
  if (prompt.length > env.maxPromptChars) {
    throw new RequestGuardError(`Prompt exceeds ${env.maxPromptChars} characters`, 400);
  }
}
