import { describe, expect, it } from "vitest";
import { MAX_PAGE, clampPage, clampPageSize } from "@/lib/utils/paging";

// Regression: the page NUMBER used to be bounded from below only. Every
// paginated service inlined `Math.max(1, Math.trunc(query.page ?? 1) || 1)`,
// which happily returned 1e20 for `?page=99999999999999999999`. That became a
// `skip` of 2e21 — past what an i64 OFFSET holds — so several PUBLIC endpoints
// (/api/companies, /api/companies/:slug/reviews, /api/site-reviews) could be
// turned into a 500 by one query string, with no auth and no body.
describe("clampPage", () => {
  it("passes ordinary pages through unchanged", () => {
    expect(clampPage(1)).toBe(1);
    expect(clampPage(7)).toBe(7);
    expect(clampPage(MAX_PAGE)).toBe(MAX_PAGE);
  });

  it("defaults to page 1 when absent", () => {
    expect(clampPage(undefined)).toBe(1);
  });

  it.each([0, -1, -1000, Number.NaN])("floors junk (%p) to 1", (value) => {
    expect(clampPage(value)).toBe(1);
  });

  it("truncates a fractional page rather than passing it to the query", () => {
    expect(clampPage(3.9)).toBe(3);
  });

  it.each([
    MAX_PAGE + 1,
    1e12,
    1e20, // what Number.parseInt("99999999999999999999", 10) yields
    Number.MAX_SAFE_INTEGER,
    Number.POSITIVE_INFINITY,
  ])("caps an absurd page (%p) at MAX_PAGE instead of overflowing the OFFSET", (value) => {
    expect(clampPage(value)).toBe(MAX_PAGE);
  });

  it("keeps the resulting skip inside a safe integer for every allowed input", () => {
    // The property that actually matters: whatever a caller sends, the OFFSET
    // handed to Prisma stays representable. This is the invariant the services
    // rely on when they compute `(page - 1) * pageSize`.
    for (const page of [1, 2, MAX_PAGE, 1e20, Number.POSITIVE_INFINITY]) {
      const skip = (clampPage(page) - 1) * 100;
      expect(Number.isSafeInteger(skip)).toBe(true);
      expect(skip).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("clampPageSize", () => {
  it("uses the default when absent", () => {
    expect(clampPageSize(undefined, 20, 100)).toBe(20);
  });

  it("honours a size inside the range", () => {
    expect(clampPageSize(50, 20, 100)).toBe(50);
  });

  it("caps at the maximum", () => {
    expect(clampPageSize(5000, 20, 100)).toBe(100);
  });

  // 0 and NaN are falsy, so they take the default; a NEGATIVE size is truthy and
  // is floored to 1 instead. Both are safe, and this asserts what the shipped
  // code has always done — the refactor into this helper deliberately preserved
  // it rather than quietly changing a behaviour no caller had complained about.
  it.each([0, Number.NaN])("falls back to the default for falsy junk (%p)", (value) => {
    expect(clampPageSize(value, 20, 100)).toBe(20);
  });

  it("floors a negative size to 1 rather than the default", () => {
    expect(clampPageSize(-5, 20, 100)).toBe(1);
  });

  it("never returns less than 1, even if the caller's default is nonsense", () => {
    expect(clampPageSize(0.4, 20, 100)).toBe(20);
    expect(clampPageSize(1, 20, 100)).toBe(1);
  });
});
