import { describe, expect, it } from "vitest";
import {
  upsertCompanySchema,
  updateCompanySchema,
  MAX_GALLERY_IMAGES,
  MAX_SERVICE_ITEMS,
  MAX_SERVICE_LENGTH,
  MAX_BADGE_ITEMS,
} from "@/lib/validation/companies";

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

// A realistic, valid company — every bounded field near the middle of its range,
// so a test that fails is failing on the field it names and nothing else.
const base = {
  categoryIds: [uuid(1)],
  name: "Aura Interiors",
  tagline: "Turnkey interior finishing for the New Capital",
  about: "We design and deliver full residential fit-outs.",
  logo: "/img/logo.jpg",
  cover: "/img/cover.jpg",
  services: ["Full Interior Design", "Residential Finishing"],
  gallery: ["/img/1.jpg", "/img/2.jpg"],
  badges: ["Licensed", "Award-Winning"],
  phone: "+201012345678",
  location: "R7 District, New Administrative Capital",
  yearsExperience: 8,
  responseTime: "within 2 hours",
  verifiedSince: "2021",
};

describe("upsertCompanySchema — happy path", () => {
  it("accepts a realistic company", () => {
    expect(upsertCompanySchema.safeParse(base).success).toBe(true);
  });

  it("accepts the largest values a real record plausibly holds", () => {
    const parsed = upsertCompanySchema.safeParse({
      ...base,
      services: Array.from({ length: MAX_SERVICE_ITEMS }, (_, i) => `Service ${i}`),
      gallery: Array.from({ length: MAX_GALLERY_IMAGES }, (_, i) => `/img/${i}.jpg`),
      badges: Array.from({ length: MAX_BADGE_ITEMS }, (_, i) => `Badge ${i}`),
    });
    expect(parsed.success).toBe(true);
  });

  // Regression (Sept 2026). The caps were sized off the SEED data — ~6 services,
  // ~6 gallery items — and production had long since outgrown them: one company
  // carried 62 gallery images against a cap of 60, and seven carried a whole
  // service list pasted into ONE tag, 139-208 characters against a cap of 120.
  //
  // The admin editor PUTs the COMPLETE record on every save, so those companies
  // could not be edited at all: whatever field the admin actually changed, the
  // over-long one went with it and the write was rejected. These two shapes are
  // the real ones, and they must stay valid.
  it("accepts the shapes production actually holds", () => {
    const longService = "أ".repeat(208); // the longest real `services` entry
    expect(
      upsertCompanySchema.safeParse({
        ...base,
        services: [longService],
        gallery: Array.from({ length: 62 }, (_, i) => `/img/${i}.jpg`),
      }).success,
    ).toBe(true);
  });
});

// Regression: these fields were `min(1)` / `min(8)` with NO upper bound and no
// array cap, while every neighbouring field was capped. `services` and `badges`
// are part of the CARD payload (serialize.ts companyScalars), so they ship on
// every company on every page of the PUBLIC /api/companies list — one company
// with a multi-megabyte array inflates an unauthenticated response for everyone,
// and the admin route that writes it reads the body with a bare request.json()
// (no size limit, unlike the public endpoints' readJsonObject).
describe("upsertCompanySchema — unbounded-field regressions", () => {
  const huge = "ا".repeat(50_000);

  it.each([
    ["location", { location: huge }],
    ["responseTime", { responseTime: huge }],
    ["verifiedSince", { verifiedSince: huge }],
    ["phone", { phone: `+2010${"1".repeat(500)}` }],
    ["whatsapp", { whatsapp: huge }],
  ])("rejects an unbounded %s", (_field, override) => {
    expect(upsertCompanySchema.safeParse({ ...base, ...override }).success).toBe(false);
  });

  it("rejects an absurd number of services", () => {
    const services = Array.from({ length: 5_000 }, (_, i) => `Service ${i}`);
    expect(upsertCompanySchema.safeParse({ ...base, services }).success).toBe(false);
  });

  it("rejects a single service that is itself enormous", () => {
    expect(upsertCompanySchema.safeParse({ ...base, services: [huge] }).success).toBe(false);
    // …and the boundary itself, so raising MAX_SERVICE_LENGTH stays deliberate.
    expect(
      upsertCompanySchema.safeParse({ ...base, services: ["x".repeat(MAX_SERVICE_LENGTH + 1)] }).success,
    ).toBe(false);
  });

  it("rejects an absurd number of badges and gallery entries", () => {
    expect(
      upsertCompanySchema.safeParse({
        ...base,
        badges: Array.from({ length: 500 }, (_, i) => `B${i}`),
      }).success,
    ).toBe(false);
    expect(
      upsertCompanySchema.safeParse({
        ...base,
        gallery: Array.from({ length: 500 }, (_, i) => `/img/${i}.jpg`),
      }).success,
    ).toBe(false);
  });

  it("rejects a years-of-experience that would break every layout that renders it", () => {
    expect(upsertCompanySchema.safeParse({ ...base, yearsExperience: 999_999_999 }).success).toBe(false);
  });

  it("caps the replace-all projects array", () => {
    const project = { title: "P", img: "/p.jpg", description: "d", year: "2024" };
    expect(
      upsertCompanySchema.safeParse({
        ...base,
        projects: Array.from({ length: 1_000 }, () => project),
      }).success,
    ).toBe(false);
  });
});

// .partial() keeps each field's own rules — the caps must survive onto the PATCH
// path too, or the bound is only enforced on create and every real edit skips it.
describe("updateCompanySchema", () => {
  it("accepts a partial patch", () => {
    expect(updateCompanySchema.safeParse({ location: "R8 District" }).success).toBe(true);
  });

  it("still enforces the caps on a partial patch", () => {
    expect(updateCompanySchema.safeParse({ location: "ا".repeat(50_000) }).success).toBe(false);
    expect(
      updateCompanySchema.safeParse({
        services: Array.from({ length: 5_000 }, (_, i) => `S${i}`),
      }).success,
    ).toBe(false);
  });

  it("still requires at least one category when categoryIds is supplied", () => {
    expect(updateCompanySchema.safeParse({ categoryIds: [] }).success).toBe(false);
  });
});
