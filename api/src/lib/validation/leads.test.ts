import { describe, expect, it } from "vitest";
import { createLeadSchema, trackLeadSchema } from "@/lib/validation/leads";

const base = {
  companySlug: "aura-interiors",
  companyName: "Aura Interiors",
  service: "Full Interior Design",
  name: "Mona Adel",
  phone: "+201012345678",
  district: "R7 District",
  budget: "EGP 150,000 – 500,000",
  description: "I need a full fit-out for a 3-bedroom apartment.",
};

// The frontend's PhoneInput always normalizes to E.164 before submitting, so
// the server now validates real international E.164 (via libphonenumber-js)
// instead of an Egypt-only regex — see PhoneInput plan (international support).
describe("createLeadSchema phone", () => {
  it.each([
    "+201012345678", // Egypt mobile, E.164
    "+201112345678",
    "+201512345678",
    "+14155552671", // a valid non-Egyptian number, now accepted
    "+442071838750",
  ])("accepts %s", (phone) => {
    expect(createLeadSchema.safeParse({ ...base, phone }).success).toBe(true);
  });

  it.each([
    "12345", // too short, no country code
    "01012345678", // local form without a leading + — no longer accepted directly
    "201012345678", // country code without a leading +
    "+201", // truncated
    "+999123456789", // unrecognized country calling code
    "abcdefghijk",
  ])("rejects %s", (phone) => {
    expect(createLeadSchema.safeParse({ ...base, phone }).success).toBe(false);
  });
});

describe("createLeadSchema fields", () => {
  it("accepts a valid payload", () => {
    expect(createLeadSchema.safeParse(base).success).toBe(true);
  });

  it("trims and rejects a too-short name", () => {
    expect(createLeadSchema.safeParse({ ...base, name: "A" }).success).toBe(false);
  });

  it("accepts an empty budget and description — neither is required anymore", () => {
    expect(createLeadSchema.safeParse({ ...base, budget: "", description: "" }).success).toBe(true);
  });

  it("ignores unknown keys like the honeypot field", () => {
    const parsed = createLeadSchema.parse({ ...base, hp_field: "spam" });
    expect(parsed).not.toHaveProperty("hp_field");
  });
});

describe("trackLeadSchema", () => {
  it("accepts a ref + valid phone (legacy secret)", () => {
    expect(
      trackLeadSchema.safeParse({ ref: "AA-20260101-7F3K", phone: "01012345678" }).success,
    ).toBe(true);
  });

  it("accepts a ref + tracking token (no phone)", () => {
    expect(
      trackLeadSchema.safeParse({ ref: "AA-20260101-7F3K", token: "abc123XYZ_token" }).success,
    ).toBe(true);
  });

  it("rejects when neither token nor phone is supplied", () => {
    expect(trackLeadSchema.safeParse({ ref: "AA-20260101-7F3K" }).success).toBe(false);
  });

  it("rejects a missing ref or invalid phone", () => {
    expect(trackLeadSchema.safeParse({ ref: "", phone: "01012345678" }).success).toBe(false);
    expect(trackLeadSchema.safeParse({ ref: "AA-1", phone: "123" }).success).toBe(false);
    expect(trackLeadSchema.safeParse({ ref: "AA-1", phone: null }).success).toBe(false);
  });
});
