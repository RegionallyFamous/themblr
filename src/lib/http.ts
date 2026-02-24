import { randomUUID } from "node:crypto";

export function requestIdFromHeaders(headers: Headers): string {
  return headers.get("x-request-id") || randomUUID();
}

export function jsonResponse(payload: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...headers,
    },
  });
}
