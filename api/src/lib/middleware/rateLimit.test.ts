import { describe, expect, it } from "vitest";
import { clientIp, rateLimit } from "@/lib/middleware/rateLimit";

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
