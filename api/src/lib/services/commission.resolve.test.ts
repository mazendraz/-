// The property under test is small and easy to break: **0 is a real commission
// rate.** The providers Al Asima deliberately takes nothing from are recorded
// as 0, and every step of the chain — resolve, serialize, write — has to carry
// that through unchanged. A single `if (company.commissionPercent)` anywhere in
// it silently reclassifies those providers as "no override set" and bills them
// at the platform default, with nothing in the ledger to show it happened.
//
// The second property: flat and percent never both apply. setCommission writes
// both columns on every call so the pair can't be populated together, and the
// resolution order below only ever has one company-level answer to pick.
import { describe, expect, it } from "vitest";
import { commissionAmount, resolveCommission, type ResolvedCommission } from "./finance.service";

/** Minimal stand-in for the Db shape resolveCommission reads. */
function fakeDb(company: { commissionFlat?: number | null; commissionPercent?: number | null } | null, defaultSetting?: string) {
  return {
    company: { findUnique: async () => company },
    appSetting: { findUnique: async () => (defaultSetting === undefined ? null : { value: defaultSetting }) },
  } as never;
}

describe("resolveCommission", () => {
  it("prefers a flat amount over a percentage", async () => {
    const r = await resolveCommission(fakeDb({ commissionFlat: 250, commissionPercent: 12 }), "c1");
    expect(r).toEqual({ kind: "FLAT", amount: 250 });
  });

  it("uses the company percentage when there is no flat amount", async () => {
    const r = await resolveCommission(fakeDb({ commissionFlat: null, commissionPercent: 12 }), "c1");
    expect(r).toEqual({ kind: "PERCENT", percent: 12 });
  });

  it("falls back to the platform default, then to the built-in", async () => {
    expect(await resolveCommission(fakeDb({ commissionFlat: null, commissionPercent: null }, "7"), "c1"))
      .toEqual({ kind: "PERCENT", percent: 7 });
    expect(await resolveCommission(fakeDb({ commissionFlat: null, commissionPercent: null }), "c1"))
      .toEqual({ kind: "PERCENT", percent: 10 });
  });

  // The regression these two exist for. Both would pass a truthiness check
  // straight through to the platform default.
  it("treats a 0% company rate as a rate, not as 'unset'", async () => {
    const r = await resolveCommission(fakeDb({ commissionFlat: null, commissionPercent: 0 }, "10"), "c1");
    expect(r).toEqual({ kind: "PERCENT", percent: 0 });
  });

  it("treats a flat 0 as a rate, not as 'unset'", async () => {
    const r = await resolveCommission(fakeDb({ commissionFlat: 0, commissionPercent: null }, "10"), "c1");
    expect(r).toEqual({ kind: "FLAT", amount: 0 });
  });
});

describe("commissionAmount", () => {
  it("charges the flat amount regardless of job size", () => {
    const flat: ResolvedCommission = { kind: "FLAT", amount: 250 };
    expect(commissionAmount(flat, 1_000)).toBe(250);
    expect(commissionAmount(flat, 100_000)).toBe(250);
  });

  it("charges nothing at either kind of zero", () => {
    expect(commissionAmount({ kind: "FLAT", amount: 0 }, 50_000)).toBe(0);
    expect(commissionAmount({ kind: "PERCENT", percent: 0 }, 50_000)).toBe(0);
  });

  it("rounds a percentage to whole pounds", () => {
    expect(commissionAmount({ kind: "PERCENT", percent: 12.5 }, 1_999)).toBe(250);
  });
});
