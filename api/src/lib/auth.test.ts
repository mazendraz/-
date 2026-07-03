import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { hashPassword, signToken, verifyPassword, verifyPasswordSafe } from "@/lib/auth";

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
