export interface LogContext {
  requestId: string;
  path: string;
  status: string;
  durationMs: number;
  retryCount?: number;
  passed?: boolean;
}

export function logRequest(context: LogContext) {
  const payload = {
    level: "info",
    at: new Date().toISOString(),
    ...context,
  };

  console.log(JSON.stringify(payload));
}

export function logError(requestId: string, path: string, error: unknown) {
  const payload = {
    level: "error",
    at: new Date().toISOString(),
    requestId,
    path,
    message: error instanceof Error ? error.message : String(error),
  };

  console.error(JSON.stringify(payload));
}
