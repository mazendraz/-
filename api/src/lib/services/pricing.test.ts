// Runs the SHARED fixtures at ../../../../pricing-cases.json through the backend
// calculator. app/src/lib/pricing.test.ts runs the exact same file through the
// frontend one. That pairing is the only thing stopping the two implementations
// from drifting apart, so if you add a case, both sides must satisfy it.
//
// Read with readFileSync at runtime rather than `import`: a JSON import would
// need resolveJsonModule wiring on both sides and would get bundled into the
// frontend build. Two lines of fs, no build config.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { calculateRequest, bestDiscount, type PricedItem, type BundleRuleInput } from "@/lib/services/pricing";

interface Case {
  name: string;
  input: { items: PricedItem[]; bundleRules: BundleRuleInput[] };
  expected: {
    subtotalMin: number | null;
    subtotalMax: number | null;
    totalMin: number | null;
    totalMax: number | null;
    discountPercent: number;
    hasOnInspection: boolean;
    pricedCount: number;
  };
}

const fixture = JSON.parse(
  readFileSync(new URL("../../../../pricing-cases.json", import.meta.url), "utf8"),
) as { cases: Case[] };

describe("shared pricing cases (backend)", () => {
  it("loaded the shared fixture file", () => {
    // Without this, a bad path would make every it.each below vanish and the
    // suite would pass while testing nothing.
    expect(fixture.cases.length).toBeGreaterThan(5);
  });

  it.each(fixture.cases.map((c) => [c.name, c] as const))("%s", (_name, testCase) => {
    const result = calculateRequest(testCase.input.items, testCase.input.bundleRules);
    expect({
      subtotalMin: result.subtotalMin,
      subtotalMax: result.subtotalMax,
      totalMin: result.totalMin,
      totalMax: result.totalMax,
      discountPercent: result.discountPercent,
      hasOnInspection: result.hasOnInspection,
      pricedCount: result.pricedCount,
    }).toEqual(testCase.expected);
  });
});

describe("bestDiscount", () => {
  it("returns 0 when no rule qualifies", () => {
    expect(bestDiscount([{ minItems: 5, discountPercent: 20 }], 2)).toBe(0);
  });

  it("picks the largest discount among qualifying rules", () => {
    expect(bestDiscount(
      [{ minItems: 2, discountPercent: 5 }, { minItems: 3, discountPercent: 25 }],
      4,
    )).toBe(25);
  });

  it("ignores rules whose threshold is above the basket size", () => {
    expect(bestDiscount(
      [{ minItems: 2, discountPercent: 5 }, { minItems: 10, discountPercent: 50 }],
      3,
    )).toBe(5);
  });
});

describe("edge cases the fixtures don't cover", () => {
  it("treats a zero or negative quantity as 1 rather than zeroing the line", () => {
    const result = calculateRequest(
      [{ qty: 0, pricingModel: "FIXED", unitPriceMin: 500, unitPriceMax: null }],
      [],
    );
    expect(result.subtotalMin).toBe(500);
  });

  // A priced model with no number is a data problem. Folding it in as 0 would
  // quietly under-quote the customer instead of surfacing the gap.
  it("does not count a priced item that is missing its price", () => {
    const result = calculateRequest(
      [
        { qty: 1, pricingModel: "FIXED", unitPriceMin: null, unitPriceMax: null },
        { qty: 1, pricingModel: "FIXED", unitPriceMin: 1000, unitPriceMax: null },
      ],
      [],
    );
    expect(result.subtotalMin).toBe(1000);
    expect(result.lines[0]).toEqual({ lineMin: null, lineMax: null });
  });
});
