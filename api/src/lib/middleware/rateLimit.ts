// Rate limiter with two backends:
//   • In-memory sliding window — default; correct for a single instance (the PM2
//     fork deploy). Resets on restart and is per-process.
//   • Upstash Redis fixed window — used when UPSTASH_REDIS_REST_URL/TOKEN are set,
//     so limits hold across restarts and multiple instances (serverless/cluster).
//     On any Redis error it falls back to the in-memory store (still limiting,
//     just per-instance) rather than failing open to no limit.
//
// rateLimit() is async (Redis is inherently async); the in-memory path resolves
// immediately. Callers await it.
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

// How many trusted reverse-proxy hops sit in front of this app. Each trusted hop
// appends one entry to X-Forwarded-For; the entry that many positions from the
// RIGHT is the real client. Everything further left is client-supplied and
// therefore spoofable — never trust the leftmost value. Caddy alone = 1; add a
// CDN/load-balancer in front → set this to 2, etc.
const TRUSTED_PROXY_HOPS = Math.max(
  1,
  Math.trunc(Number(process.env.TRUSTED_PROXY_HOPS ?? "1")) || 1,
);

/**
 * Best-effort client IP from proxy headers (NextRequest has no `.ip` in v16).
 *
 * Reads X-Forwarded-For from the RIGHT: with `TRUSTED_PROXY_HOPS` proxies in
 * front, the real client is at `length - hops`. A client that forges
 * `X-Forwarded-For` only injects entries on the left, which we ignore — so the
 * per-IP rate limits can't be bypassed by header spoofing.
 */
export function clientIp(request: NextRequest): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const ips = xff
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (ips.length > 0) {
      const idx = Math.max(0, ips.length - TRUSTED_PROXY_HOPS);
      return ips[idx]!;
    }
  }
  // No XFF (e.g. direct connection in dev). x-real-ip is only trustworthy when a
  // proxy sets it; behind Caddy, XFF above is always present and wins.
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

// ── In-memory sliding window (default / fallback) ─────────────────────────────
// key → ascending list of request timestamps (ms) within the window.
const hits = new Map<string, number[]>();

function memoryRateLimit(
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

// ── Upstash Redis fixed window (optional, multi-instance) ─────────────────────
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL?.replace(/\/$/, "");
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

function redisEnabled(): boolean {
  return Boolean(REDIS_URL && REDIS_TOKEN);
}

// ── Production safety guard ───────────────────────────────────────────────────
// The in-memory limiter is per-process and resets on restart, so on a serverless
// or multi-instance deploy (e.g. Vercel — the default in DEPLOY.md) it provides
// effectively NO protection: each cold lambda starts with an empty counter. Fail
// fast at server boot so this can never ship silently. Operators running a single
// long-lived instance (PM2 fork) can opt in with RATE_LIMIT_ALLOW_INMEMORY=1.
//
// Pure + exported for testing; skipped during `next build` (NEXT_PHASE), since the
// build imports modules before runtime env (Redis creds) is necessarily present.
export function rateLimitConfigError(env: NodeJS.ProcessEnv): string | null {
  const redis = Boolean(env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN);
  const building = env.NEXT_PHASE === "phase-production-build";
  if (
    env.NODE_ENV === "production" &&
    !building &&
    !redis &&
    env.RATE_LIMIT_ALLOW_INMEMORY !== "1"
  ) {
    return (
      "Rate limiting is in-memory but NODE_ENV=production. In-memory limits do not " +
      "hold across serverless/multi-instance deploys. Set UPSTASH_REDIS_REST_URL + " +
      "UPSTASH_REDIS_REST_TOKEN for a distributed limiter, or set " +
      "RATE_LIMIT_ALLOW_INMEMORY=1 if you run a single long-lived instance (PM2 fork)."
    );
  }
  return null;
}

const configError = rateLimitConfigError(process.env);
if (configError) throw new Error(configError);

async function redisRateLimit(
  key: string,
  { limit, windowMs }: RateLimitOptions,
): Promise<RateLimitResult> {
  const now = Date.now();
  const windowIndex = Math.floor(now / windowMs);
  const redisKey = `rl:${key}:${windowIndex}`;
  const ttlSeconds = Math.ceil(windowMs / 1000) + 1;

  // One round-trip: INCR the window counter, then (re)set its TTL. The key is
  // unique per window, so the count is the number of hits in this window.
  const res = await fetch(`${REDIS_URL}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${REDIS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([
      ["INCR", redisKey],
      ["EXPIRE", redisKey, ttlSeconds],
    ]),
  });
  if (!res.ok) throw new Error(`Upstash responded ${res.status}`);

  const data = (await res.json()) as Array<{ result?: number; error?: string }>;
  if (data[0]?.error) throw new Error(`Upstash: ${data[0].error}`);
  const count = Number(data[0]?.result ?? 0);

  const resetAt = (windowIndex + 1) * windowMs;
  if (count > limit) {
    return { ok: false, remaining: 0, retryAfterMs: resetAt - now };
  }
  return { ok: true, remaining: Math.max(0, limit - count), retryAfterMs: 0 };
}

/**
 * Consume one unit against `key`'s limit. Uses Redis when configured, else the
 * in-memory store; a Redis failure transparently falls back to in-memory.
 */
export async function rateLimit(
  key: string,
  options: RateLimitOptions,
): Promise<RateLimitResult> {
  if (redisEnabled()) {
    try {
      return await redisRateLimit(key, options);
    } catch (err) {
      console.error("[rateLimit] Redis error — falling back to memory:", err);
    }
  }
  return memoryRateLimit(key, options);
}
