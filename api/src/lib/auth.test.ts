import { beforeAll, describe, expect, it } from "vitest";
import { hashPassword, signToken, verifyPassword } from "@/lib/auth";

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

describe("signToken", () => {
  it("produces a 3-part HS256 JWT", async () => {
    const token = await signToken({ sub: "u1", role: "ADMIN", companyId: null });
    expect(token.split(".")).toHaveLength(3);
  });
});
