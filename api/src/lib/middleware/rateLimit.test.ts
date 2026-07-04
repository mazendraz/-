import { describe, expect, it } from "vitest";
import { clientIp, rateLimit, rateLimitConfigError } from "@/lib/middleware/rateLimit";

describe("rateLimitConfigError (production safety guard)", () => {
  const redis = {
    UPSTASH_REDIS_REST_URL: "https://x.upstash.io",
    UPSTASH_REDIS_REST_TOKEN: "tok",
  };

  it("allows in-memory outside production", () => {
    expect(rateLimitConfigError({ NODE_ENV: "development" } as never)).toBeNull();
    expect(rateLimitConfigError({ NODE_ENV: "test" } as never)).toBeNull();
  });

  it("rejects in-memory in production without Redis", () => {
    expect(rateLimitConfigError({ NODE_ENV: "production" } as never)).toMatch(/in-memory/i);
  });

  it("allows production when Redis is configured", () => {
    expect(
      rateLimitConfigError({ NODE_ENV: "production", ...redis } as never),
    ).toBeNull();
  });

  it("allows production with the explicit single-instance opt-out", () => {
    expect(
      rateLimitConfigError({
        NODE_ENV: "production",
        RATE_LIMIT_ALLOW_INMEMORY: "1",
      } as never),
    ).toBeNull();
  });

  it("does not block the production build phase (runtime env not yet present)", () => {
    expect(
      rateLimitConfigError({
        NODE_ENV: "production",
        NEXT_PHASE: "phase-production-build",
      } as never),
    ).toBeNull();
  });
});

// TRUSTED_PROXY_HOPS defaults to 1 (Caddy), so the real client is the RIGHTMOST
// X-Forwarded-For entry. Anything to its left is client-supplied and ignored.
function reqWith(headers: Record<string, string>): never {
  return new Request("http://x/test", { headers }) as never;
}

describe("clientIp", () => {
  it("uses the rightmost XFF entry (the hop our proxy appended)", () => {
    expect(clientIp(reqWith({ "x-forwarded-for": "203.0.113.9" }))).toBe(
      "203.0.113.9",
    );
  });

  it("ignores a spoofed leftmost XFF value", () => {
    // Attacker sends `X-Forwarded-For: 1.2.3.4`; Caddy appends the real peer.
    const spoofed = clientIp(
      reqWith({ "x-forwarded-for": "1.2.3.4, 203.0.113.9" }),
    );
    expect(spoofed).toBe("203.0.113.9");
  });

  it("cannot be rotated to dodge the rate limit", () => {
    // The same real client rotating the forged prefix still resolves to one IP.
    const a = clientIp(reqWith({ "x-forwarded-for": "9.9.9.1, 203.0.113.9" }));
    const b = clientIp(reqWith({ "x-forwarded-for": "9.9.9.2, 203.0.113.9" }));
    expect(a).toBe(b);
  });

  it("falls back to x-real-ip, then 'unknown', without XFF", () => {
    expect(clientIp(reqWith({ "x-real-ip": "198.51.100.7" }))).toBe("198.51.100.7");
    expect(clientIp(reqWith({}))).toBe("unknown");
  });
});

describe("rateLimit (in-memory)", () => {
  it("allows up to the limit, then blocks within the window", async () => {
    const key = `test:${Math.random()}`;
    const opts = { limit: 3, windowMs: 60_000 };
    expect((await rateLimit(key, opts)).ok).toBe(true);
    expect((await rateLimit(key, opts)).ok).toBe(true);
    expect((await rateLimit(key, opts)).ok).toBe(true);
    const blocked = await rateLimit(key, opts);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
  });

  it("scopes counters per key", async () => {
    const opts = { limit: 1, windowMs: 60_000 };
    expect((await rateLimit(`a:${Math.random()}`, opts)).ok).toBe(true);
    expect((await rateLimit(`b:${Math.random()}`, opts)).ok).toBe(true);
  });
});
