// Request total calculation — THE AUTHORITY.
//
// app/src/lib/pricing.ts implements the same maths for the live preview while a
// customer builds a request, but only the numbers produced here are persisted on
// the Lead. If the two ever disagree, this one is right.
//
// The duplication is deliberate technical debt (a shared workspace package would
// restructure the monorepo). `pricing-cases.json` at the repo root is what keeps
// them honest — a test on each side runs the same fixtures.

export type PricingModelValue = "FIXED" | "RANGE" | "PER_UNIT" | "ON_INSPECTION";

/** One line, already resolved to unit prices (tier price wins over offering price). */
export interface PricedItem {
  qty: number;
  pricingModel: PricingModelValue;
  unitPriceMin: number | null;
  unitPriceMax: number | null;
}

export interface BundleRuleInput {
  minItems: number;
  discountPercent: number;
}

export interface PricingResult {
  /** null (not 0) when nothing in the request carries a price. */
  subtotalMin: number | null;
  subtotalMax: number | null;
  totalMin: number | null;
  totalMax: number | null;
  discountPercent: number;
  hasOnInspection: boolean;
  /** How many lines actually carried a price — drives "+ items quoted on site". */
  pricedCount: number;
  lines: { lineMin: number | null; lineMax: number | null }[];
}

/**
 * Total a request.
 *
 * Two decisions worth stating plainly, because they are not obvious:
 *
 * 1. Inspection items are excluded by their MODEL, not by having a null price.
 *    A row with pricingModel FIXED and a missing price is a data problem, and
 *    silently folding it in as free would hide it.
 *
 * 2. The bundle threshold counts EVERY selected item, but the discount only
 *    reduces the priced amount. Someone picking three things — two of them
 *    quoted on site — has still committed to three, so they reach the threshold;
 *    there is simply nothing to take a percentage off for the other two.
 */
export function calculateRequest(
  items: PricedItem[],
  bundleRules: BundleRuleInput[],
): PricingResult {
  const priced = items.filter((i) => i.pricingModel !== "ON_INSPECTION");
  const hasOnInspection = items.some((i) => i.pricingModel === "ON_INSPECTION");

  const lines = items.map((item) => {
    if (item.pricingModel === "ON_INSPECTION" || item.unitPriceMin == null) {
      return { lineMin: null, lineMax: null };
    }
    const qty = Math.max(1, Math.trunc(item.qty) || 1);
    // A missing max means a single price, not "unbounded" — mirror the min so a
    // range of one number reads as that number rather than as open-ended.
    const max = item.unitPriceMax ?? item.unitPriceMin;
    return { lineMin: qty * item.unitPriceMin, lineMax: qty * max };
  });

  if (priced.length === 0) {
    // Nothing to add up. Returning 0 here would render as "0 – 0 EGP", which
    // reads as free rather than as "we'll quote you".
    return {
      subtotalMin: null, subtotalMax: null,
      totalMin: null, totalMax: null,
      discountPercent: 0, hasOnInspection, pricedCount: 0, lines,
    };
  }

  const subtotalMin = lines.reduce((sum, l) => sum + (l.lineMin ?? 0), 0);
  const subtotalMax = lines.reduce((sum, l) => sum + (l.lineMax ?? 0), 0);

  // Threshold on the full basket; best qualifying rule wins; applied once.
  const discountPercent = bestDiscount(bundleRules, items.length);

  const factor = (1 - discountPercent / 100);
  const totalMin = Math.round(subtotalMin * factor);
  const totalMax = Math.round(subtotalMax * factor);

  return {
    subtotalMin, subtotalMax, totalMin, totalMax,
    discountPercent, hasOnInspection, pricedCount: priced.length, lines,
  };
}

/** Highest discount among the rules the basket qualifies for. 0 when none do. */
export function bestDiscount(rules: BundleRuleInput[], itemCount: number): number {
  return rules
    .filter((r) => itemCount >= r.minItems)
    .reduce((best, r) => Math.max(best, r.discountPercent), 0);
}
