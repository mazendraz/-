// Sliding-window rate limiter. In-memory implementation for dev/single-instance.
// In production (serverless / multi-instance) swap the store for Upstash Redis —
// the `rateLimit()` signature stays the same.
import type { NextRequest } from "next/server";

interface RateLimitOptions {
  limit: number;
  windowMs: number;
}

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterMs: number;
}

// key → ascending list of request timestamps (ms) within the window.
const hits = new Map<string, number[]>();

/** Best-effort client IP from proxy headers (NextRequest has no `.ip` in v16). */
export function clientIp(request: NextRequest): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

export function rateLimit(
  key: string,
  { limit, windowMs }: RateLimitOptions,
): RateLimitResult {
  const now = Date.now();
  const windowStart = now - windowMs;

  const timestamps = (hits.get(key) ?? []).filter((t) => t > windowStart);

  if (timestamps.length >= limit) {
    const oldest = timestamps[0]!;
    hits.set(key, timestamps);
    return { ok: false, remaining: 0, retryAfterMs: oldest + windowMs - now };
  }

  timestamps.push(now);
  hits.set(key, timestamps);
  return { ok: true, remaining: limit - timestamps.length, retryAfterMs: 0 };
}

// Periodically drop stale keys so the map doesn't grow unbounded in long-lived
// dev processes. unref() so it never keeps the process alive.
const SWEEP_MS = 5 * 60 * 1000;
const sweeper = setInterval(() => {
  const cutoff = Date.now() - SWEEP_MS;
  for (const [key, ts] of hits) {
    if (ts.every((t) => t <= cutoff)) hits.delete(key);
  }
}, SWEEP_MS);
sweeper.unref?.();
