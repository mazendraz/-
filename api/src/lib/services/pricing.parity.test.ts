// Proves the two request-total implementations agree.
//
// The maths lives twice: api/src/lib/services/pricing.ts (the authority — its
// numbers are persisted on the Lead) and app/src/lib/pricing.ts (the live
// preview as the customer builds a request). That duplication is deliberate
// technical debt; the clean fix is a shared workspace package, which would
// restructure the monorepo.
//
// The plan called for one fixture test on each side. This runs BOTH
// implementations over the SAME cases in one file instead, which is a stronger
// guarantee: two separate suites can quietly stop running the same set, and then
// each passes while disagreeing with the other. Here a divergence fails
// immediately, on the case that diverged.
//
// (The app package has no unit-test runner of its own — only Playwright — so
// this also avoids adding one just to hold a mirror of these fixtures.)
//
// Importing across the package boundary is safe here specifically because
// app/src/lib/pricing.ts has no runtime imports; the same reach already exists
// in api/prisma/seed.ts.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { calculateRequest as backendCalculate } from "@/lib/services/pricing";
import { calculateRequest as frontendCalculate } from "../../../../app/src/lib/pricing";

interface Case {
  name: string;
  input: {
    items: {
      qty: number;
      pricingModel: "FIXED" | "RANGE" | "PER_UNIT" | "ON_INSPECTION";
      unitPriceMin: number | null;
      unitPriceMax: number | null;
    }[];
    bundleRules: { minItems: number; discountPercent: number }[];
  };
  expected: Record<string, unknown>;
}

const fixture = JSON.parse(
  readFileSync(new URL("../../../../pricing-cases.json", import.meta.url), "utf8"),
) as { cases: Case[] };

describe("frontend/backend pricing parity", () => {
  it("loaded the shared fixture file", () => {
    expect(fixture.cases.length).toBeGreaterThan(5);
  });

  it.each(fixture.cases.map((c) => [c.name, c] as const))(
    "frontend matches backend: %s",
    (_name, testCase) => {
      const back = backendCalculate(testCase.input.items, testCase.input.bundleRules);
      const front = frontendCalculate(testCase.input.items, testCase.input.bundleRules);
      expect(front).toEqual(back);
    },
  );

  it.each(fixture.cases.map((c) => [c.name, c] as const))(
    "frontend matches the expected fixture: %s",
    (_name, testCase) => {
      const r = frontendCalculate(testCase.input.items, testCase.input.bundleRules);
      expect({
        subtotalMin: r.subtotalMin,
        subtotalMax: r.subtotalMax,
        totalMin: r.totalMin,
        totalMax: r.totalMax,
        discountPercent: r.discountPercent,
        hasOnInspection: r.hasOnInspection,
        pricedCount: r.pricedCount,
      }).toEqual(testCase.expected);
    },
  );
});
