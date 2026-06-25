import { describe, expect, it } from "vitest";
import { createLeadSchema } from "@/lib/validation/leads";

const base = {
  companySlug: "aura-interiors",
  companyName: "Aura Interiors",
  service: "Full Interior Design",
  name: "Mona Adel",
  phone: "01012345678",
  district: "R7 District",
  budget: "EGP 150,000 – 500,000",
  description: "I need a full fit-out for a 3-bedroom apartment.",
};

describe("createLeadSchema phone", () => {
  it.each([
    "01012345678", // local
    "01112345678",
    "01212345678",
    "01512345678",
    "201012345678", // country code, no plus
    "+201012345678", // E.164 (trunk 0 dropped)
  ])("accepts %s", (phone) => {
    expect(createLeadSchema.safeParse({ ...base, phone }).success).toBe(true);
  });

  it.each([
    "12345", // too short
    "01312345678", // invalid operator prefix 013
    "0101234567", // one digit short
    "010123456789", // one digit long
    "abcdefghijk",
  ])("rejects %s", (phone) => {
    expect(createLeadSchema.safeParse({ ...base, phone }).success).toBe(false);
  });
});

describe("createLeadSchema fields", () => {
  it("accepts a valid payload", () => {
    expect(createLeadSchema.safeParse(base).success).toBe(true);
  });

  it("trims and rejects too-short name / description", () => {
    expect(createLeadSchema.safeParse({ ...base, name: "A" }).success).toBe(false);
    expect(
      createLeadSchema.safeParse({ ...base, description: "too short" }).success,
    ).toBe(false);
  });

  it("ignores unknown keys like the honeypot field", () => {
    const parsed = createLeadSchema.parse({ ...base, website: "spam" });
    expect(parsed).not.toHaveProperty("website");
  });
});
