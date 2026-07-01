import { beforeAll, describe, expect, it } from "vitest";
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
