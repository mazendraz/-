import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  hashPassword,
  signToken,
  verifyPassword,
  verifyPasswordSafe,
  ttlToSeconds,
  sessionCookieOptions,
} from "@/lib/auth";

beforeAll(() => {
  process.env.JWT_SECRET = "test-secret-for-vitest";
});

describe("password hashing", () => {
  it("verifies a correct password and rejects a wrong one", async () => {
    const hash = await hashPassword("Admin123!");
    expect(hash).not.toBe("Admin123!"); // never store plaintext
    expect(await verifyPassword("Admin123!", hash)).toBe(true);
    expect(await verifyPassword("WrongPass", hash)).toBe(false);
  });
});

describe("verifyPasswordSafe", () => {
  it("returns true for a correct password against a real hash", async () => {
    const hash = await hashPassword("Admin123!");
    expect(await verifyPasswordSafe("Admin123!", hash)).toBe(true);
    expect(await verifyPasswordSafe("WrongPass", hash)).toBe(false);
  });

  it("returns false (and still compares) when the hash is null — no such user", async () => {
    // Always false for a null hash, regardless of the input — timing is equalized
    // by an internal dummy compare so account existence doesn't leak.
    expect(await verifyPasswordSafe("anything", null)).toBe(false);
    expect(await verifyPasswordSafe("", null)).toBe(false);
  });
});

describe("signToken", () => {
  it("produces a 3-part HS256 JWT", async () => {
    const token = await signToken({ sub: "u1", role: "ADMIN", companyId: null });
    expect(token.split(".")).toHaveLength(3);
  });
});

describe("ttlToSeconds", () => {
  it("parses day/hour/minute/second units and bare seconds", () => {
    expect(ttlToSeconds("1d")).toBe(86400);
    expect(ttlToSeconds("12h")).toBe(43200);
    expect(ttlToSeconds("30m")).toBe(1800);
    expect(ttlToSeconds("45s")).toBe(45);
    expect(ttlToSeconds("3600")).toBe(3600);
  });
  it("falls back to 1 day on garbage", () => {
    expect(ttlToSeconds("nonsense")).toBe(86400);
  });
});

describe("sessionCookieOptions", () => {
  const original = process.env.NODE_ENV;
  afterEach(() => vi.unstubAllEnvs());

  it("is httpOnly + SameSite=strict with a matching maxAge", () => {
    const o = sessionCookieOptions();
    expect(o.httpOnly).toBe(true);
    expect(o.sameSite).toBe("strict");
    expect(o.path).toBe("/");
    expect(o.maxAge).toBeGreaterThan(0);
  });

  it("is Secure only in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(sessionCookieOptions().secure).toBe(true);
    vi.stubEnv("NODE_ENV", "development");
    expect(sessionCookieOptions().secure).toBe(false);
  });

  it("keeps NODE_ENV isolated", () => {
    expect(process.env.NODE_ENV).toBe(original);
  });
});

describe("JWT secret strength guard", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejects a short secret in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("JWT_SECRET", "too-short");
    // secretKey() is called synchronously inside signToken (not an async fn), so
    // the guard throws synchronously — before any promise is created.
    expect(() => signToken({ sub: "u1", role: "ADMIN", companyId: null })).toThrow(
      /too short/i,
    );
  });

  it("accepts a strong (≥32 char) secret in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("JWT_SECRET", "x".repeat(32));
    const token = await signToken({ sub: "u1", role: "ADMIN", companyId: null });
    expect(token.split(".")).toHaveLength(3);
  });

  it("allows a short secret outside production (dev/test convenience)", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("JWT_SECRET", "short-dev-secret");
    const token = await signToken({ sub: "u1", role: "ADMIN", companyId: null });
    expect(token.split(".")).toHaveLength(3);
  });
});
