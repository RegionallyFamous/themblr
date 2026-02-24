export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

const state = new Map<string, number[]>();

export function checkRateLimit(ip: string, max: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const windowStart = now - windowMs;

  const previous = state.get(ip) ?? [];
  const filtered = previous.filter((ts) => ts > windowStart);

  if (filtered.length >= max) {
    const oldest = filtered[0] ?? now;
    return {
      allowed: false,
      remaining: 0,
      resetAt: oldest + windowMs,
    };
  }

  filtered.push(now);
  state.set(ip, filtered);

  return {
    allowed: true,
    remaining: Math.max(0, max - filtered.length),
    resetAt: now + windowMs,
  };
}

export function clearRateLimitStateForTests() {
  state.clear();
}
