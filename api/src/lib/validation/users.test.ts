import { describe, expect, it } from "vitest";
import { createUserSchema, updateUserSchema } from "@/lib/validation/users";

const base = {
  name: "Provider One",
  email: "Provider@Example.com",
  password: "strongpass1",
};

describe("createUserSchema", () => {
  it("accepts a valid payload and defaults role to PROVIDER", () => {
    const parsed = createUserSchema.parse(base);
    expect(parsed.role).toBe("PROVIDER");
    expect(parsed.companyId).toBeNull();
  });

  it("lowercases and trims the email", () => {
    expect(createUserSchema.parse(base).email).toBe("provider@example.com");
  });

  it("rejects a short password", () => {
    expect(createUserSchema.safeParse({ ...base, password: "short" }).success).toBe(false);
  });

  it("rejects an invalid email", () => {
    expect(createUserSchema.safeParse({ ...base, email: "nope" }).success).toBe(false);
  });

  it("accepts a uuid companyId and an ADMIN role", () => {
    const parsed = createUserSchema.parse({
      ...base,
      role: "ADMIN",
      companyId: "11111111-1111-4111-8111-111111111111",
    });
    expect(parsed.role).toBe("ADMIN");
    expect(parsed.companyId).toBe("11111111-1111-4111-8111-111111111111");
  });

  it("rejects a non-uuid companyId", () => {
    expect(createUserSchema.safeParse({ ...base, companyId: "co-1" }).success).toBe(false);
  });
});

describe("updateUserSchema", () => {
  it("rejects an empty patch", () => {
    expect(updateUserSchema.safeParse({}).success).toBe(false);
  });

  it("accepts a single field", () => {
    expect(updateUserSchema.safeParse({ isActive: false }).success).toBe(true);
  });

  it("accepts null companyId (unlink)", () => {
    expect(updateUserSchema.safeParse({ companyId: null }).success).toBe(true);
  });
});
