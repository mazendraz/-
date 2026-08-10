// Stored precision and DISPLAYED precision are two different things.
//
// `Company.rating` is a Float. The review recompute rounded it to one decimal;
// the admin's manual override wrote whatever number it was handed, and every
// render site printed the raw value with `{c.rating}`. The result on a company
// card was `★ 4.666666666666667` — a number that is both wrong to read and wide
// enough to push the stats line out of its row.
//
// Fixing only the write path would leave every existing row broken. Fixing only
// the read path would let new ones keep drifting in the column. Both halves are
// covered here, in one file, for the same reason pricing.parity.test.ts pairs its
// two implementations: two separate suites can quietly stop testing the same
// thing, and then each passes while the pair disagrees.
//
// Reaching across the package boundary is safe for the same reason it is in
// pricing.parity.test.ts — app/src/lib/format.ts has no runtime imports.
import { describe, expect, it } from "vitest";
import { roundRating } from "@/lib/services/companies.service";
import { formatRating } from "../../../../app/src/lib/format";

// ── Write half: nothing unrounded can enter the column ───────────────────────
describe("roundRating (write path)", () => {
  it("rounds to the one decimal the review recompute also produces", () => {
    expect(roundRating(4.666666666666667)).toBe(4.7);
    expect(roundRating(4.44)).toBe(4.4);
    expect(roundRating(3.05)).toBe(3.1);
    expect(roundRating(5)).toBe(5);
    expect(roundRating(0)).toBe(0);
  });

  it("clamps outside the 0..5 star range rather than storing nonsense", () => {
    expect(roundRating(9.9)).toBe(5);
    expect(roundRating(-3)).toBe(0);
  });

  // Non-finite input falls to 0, NOT to the top of the range. A rating is a
  // claim about a business, so the safe reading of an unusable number is "no
  // rating", never "a perfect one" — a bad write must not be able to award five
  // stars.
  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "resolves non-finite input (%p) to 0 rather than a perfect score",
    (value) => {
      expect(roundRating(value)).toBe(0);
    },
  );
});

// ── Read half: nothing in the column can render long ─────────────────────────
describe("formatRating (display path)", () => {
  it("renders the value that started this — one decimal, not seventeen", () => {
    expect(formatRating("en", 4.666666666666667)).toBe("4.7");
    expect(formatRating("ar", 4.666666666666667)).toBe("4.7");
  });

  it("keeps a trailing zero so a column of ratings stays aligned", () => {
    expect(formatRating("en", 4)).toBe("4.0");
    expect(formatRating("en", 5)).toBe("5.0");
    expect(formatRating("en", 0)).toBe("0.0");
  });

  it("uses Latin digits in Arabic, matching every other number on the site", () => {
    // The whole product renders Latin numerals inside Arabic text (see
    // format.ts intlLocale) — a rating must not be the one exception.
    expect(formatRating("ar", 4.5)).toBe("4.5");
    expect(formatRating("ar", 3.2)).toMatch(/^[0-9.]+$/);
  });

  it("clamps a value outside the star range instead of drawing six stars", () => {
    expect(formatRating("en", 7.4)).toBe("5.0");
    expect(formatRating("en", -1)).toBe("0.0");
  });

  it("degrades to a dash rather than printing NaN at a customer", () => {
    expect(formatRating("en", Number.NaN)).toBe("—");
    expect(formatRating("en", Number.POSITIVE_INFINITY)).toBe("—");
  });

  it("never renders more than one decimal, for any input", () => {
    const inputs = [0, 0.04, 1 / 3, 2 / 3, 3.14159, 4.999, 4.95, 5];
    for (const value of inputs) {
      const out = formatRating("en", value);
      expect(out, `formatRating(${value}) = ${out}`).toMatch(/^\d\.\d$/);
    }
  });
});

// The two halves must agree: a value rounded on write then formatted on read
// should not change again.
describe("write and read halves agree", () => {
  it.each([4.666666666666667, 1 / 3, 2.25, 4.999, 0.05])(
    "formatRating(roundRating(%p)) is stable",
    (raw) => {
      const stored = roundRating(raw);
      const shown = formatRating("en", stored);
      expect(shown).toBe(formatRating("en", roundRating(stored)));
      expect(Number(shown)).toBeCloseTo(stored, 5);
    },
  );
});
