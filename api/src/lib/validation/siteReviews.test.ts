import { describe, expect, it } from "vitest";
import {
  createSiteReviewSchema,
  siteReviewSettingsSchema,
  siteReviewVisibilitySchema,
} from "@/lib/validation/siteReviews";

describe("createSiteReviewSchema", () => {
  const valid = { name: "Mona A.", district: "R7 District", rating: 5, text: "Great work all round." };

  it("accepts a well-formed review", () => {
    expect(createSiteReviewSchema.parse(valid)).toMatchObject(valid);
  });

  it("trims surrounding whitespace", () => {
    const parsed = createSiteReviewSchema.parse({ ...valid, name: "  Mona A.  " });
    expect(parsed.name).toBe("Mona A.");
  });

  it("rejects out-of-range ratings", () => {
    expect(() => createSiteReviewSchema.parse({ ...valid, rating: 0 })).toThrow();
    expect(() => createSiteReviewSchema.parse({ ...valid, rating: 6 })).toThrow();
    expect(() => createSiteReviewSchema.parse({ ...valid, rating: 4.5 })).toThrow();
  });

  it("rejects a too-short name and too-short text", () => {
    expect(() => createSiteReviewSchema.parse({ ...valid, name: "M" })).toThrow();
    expect(() => createSiteReviewSchema.parse({ ...valid, text: "no" })).toThrow();
  });
});

describe("toggle schemas", () => {
  it("validate boolean flags", () => {
    expect(siteReviewVisibilitySchema.parse({ visible: true })).toEqual({ visible: true });
    expect(siteReviewSettingsSchema.parse({ enabled: false })).toEqual({ enabled: false });
    expect(() => siteReviewVisibilitySchema.parse({ visible: "yes" })).toThrow();
  });
});
