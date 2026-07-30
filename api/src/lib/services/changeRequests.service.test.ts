import { describe, expect, it } from "vitest";
import {
  EDITABLE_FIELDS,
  assertEditableFields,
  findConflicts,
} from "@/lib/services/changeRequests.service";
import { ValidationError } from "@/lib/utils/errors";

// Every field an attacker would most want to set on themselves. The allowlist is
// what stops these, but "the allowlist is correct" is worth proving key by key —
// this is the feature whose entire job is to gate provider edits, so a hole here
// is worse than having no gate at all.
const FORBIDDEN_ON_COMPANY = [
  // trust signals — an admin decides these, never the provider
  "verified", "verifiedSince", "featured", "status",
  "rating", "reviewCount", "ratingOverridden", "completedProjects",
  // identity / ownership
  "id", "slug", "categoryId", "companyId",
  // auth material
  "telegramChatId", "telegramLinkToken", "telegramLinkExpires",
  // bookkeeping
  "createdAt", "updatedAt",
  // has its own immediate endpoint, must not be queued behind review
  "busy", "busyUntil", "busyNote",
  // moves to Offerings in Feature B
  "services",
  // relation keys
  "category", "projects", "reviews", "leads", "users",
  // Feature B columns that must never be provider-writable
  "isPublished", "priceUpdatedAt",
];

describe("EDITABLE_FIELDS allowlist", () => {
  it.each(FORBIDDEN_ON_COMPANY)("rejects %s on COMPANY", (key) => {
    expect(() => assertEditableFields("COMPANY", { [key]: "x" })).toThrow(ValidationError);
  });

  it("rejects a forbidden key even when mixed with legitimate ones", () => {
    expect(() =>
      assertEditableFields("COMPANY", { tagline: "New tagline", verified: true }),
    ).toThrow(ValidationError);
  });

  it("names the offending field so the provider can fix it", () => {
    try {
      assertEditableFields("COMPANY", { verified: true });
      expect.unreachable("should have thrown");
    } catch (err) {
      expect((err as Error).message).toContain("verified");
    }
  });

  it.each([...EDITABLE_FIELDS.COMPANY])("accepts the editable field %s", (key) => {
    expect(() => assertEditableFields("COMPANY", { [key]: "x" })).not.toThrow();
  });

  it("rejects an empty change set", () => {
    expect(() => assertEditableFields("COMPANY", {})).toThrow(ValidationError);
  });

  it("keeps sortOrder out of OFFERING_TIER (it is an immediate-write field)", () => {
    expect(EDITABLE_FIELDS.OFFERING_TIER).not.toContain("sortOrder");
    expect(EDITABLE_FIELDS.OFFERING).not.toContain("sortOrder");
    expect(EDITABLE_FIELDS.OFFERING).not.toContain("isActive");
  });
});

describe("findConflicts", () => {
  it("reports a field an admin changed after submission", () => {
    expect(findConflicts({ tagline: "old" }, { tagline: "admin edited" })).toEqual(["tagline"]);
  });

  it("reports nothing when the live value still matches", () => {
    expect(findConflicts({ tagline: "same" }, { tagline: "same" })).toEqual([]);
  });

  // The whole reason this uses isDeepStrictEqual instead of !==. With reference
  // equality every gallery/badges review would be flagged as "changed since
  // submission" when nothing changed, and the admin would learn to ignore the
  // warning — at which point it hides the real conflicts it exists to surface.
  it("does NOT flag arrays that are equal by value", () => {
    expect(findConflicts(
      { gallery: ["/a.jpg", "/b.jpg"], badges: ["Licensed"] },
      { gallery: ["/a.jpg", "/b.jpg"], badges: ["Licensed"] },
    )).toEqual([]);
  });

  it("does flag arrays that genuinely differ", () => {
    expect(findConflicts(
      { gallery: ["/a.jpg"] },
      { gallery: ["/a.jpg", "/b.jpg"] },
    )).toEqual(["gallery"]);
  });

  it("flags array reordering (order is meaningful for a gallery)", () => {
    expect(findConflicts({ gallery: ["/a.jpg", "/b.jpg"] }, { gallery: ["/b.jpg", "/a.jpg"] }))
      .toEqual(["gallery"]);
  });

  it("treats null and undefined as distinct from a value", () => {
    expect(findConflicts({ metaTitle: null }, { metaTitle: "Set by admin" }))
      .toEqual(["metaTitle"]);
  });

  it("only inspects fields present in the snapshot", () => {
    // An admin editing an unrelated field is not a conflict for this request.
    expect(findConflicts({ tagline: "same" }, { tagline: "same", about: "changed" }))
      .toEqual([]);
  });
});
