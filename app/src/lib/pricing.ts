// Price formatting — ONE implementation, used by every surface that shows a
// price. Provider editor, public profile, admin review and (from Feature C) the
// request summary all call through here, so a customer and the provider looking
// at the same offering can never see it worded two different ways.
// Types come from apiTypes.ts, not offerings.ts, and everything here is a pure
// function with no runtime imports. That is deliberate: this module is loaded by
// the API's test suite to prove it agrees with the backend calculator, and
// offerings.ts would drag in `./api` (and `import.meta.env`) with it.
import type { Locale } from "./i18n";
import type {
  ApiOffering as Offering,
  ApiPriceUnit as PriceUnit,
  ApiPricingModel as PricingModel,
} from "./apiTypes";

const UNIT_LABELS: Record<PriceUnit, { en: string; ar: string }> = {
  SQM: { en: "m²", ar: "م²" },
  METER: { en: "m", ar: "م" },
  PIECE: { en: "piece", ar: "قطعة" },
  DOOR: { en: "door", ar: "باب" },
  WINDOW: { en: "window", ar: "شباك" },
  ROOM: { en: "room", ar: "غرفة" },
  APARTMENT: { en: "apartment", ar: "شقة" },
  HOUR: { en: "hour", ar: "ساعة" },
  DAY: { en: "day", ar: "يوم" },
  JOB: { en: "job", ar: "المهمة" },
};

export function unitLabel(unit: PriceUnit | string | null, locale: Locale): string {
  if (!unit) return "";
  const entry = UNIT_LABELS[unit as PriceUnit];
  return entry ? entry[locale] : String(unit);
}

/**
 * Group digits for readability. Arabic here uses Western digits on purpose:
 * Egyptian price lists, invoices and shop signs overwhelmingly use them, and
 * Eastern Arabic numerals would read as unusual rather than more localized.
 */
export function formatAmount(value: number, locale: Locale): string {
  return new Intl.NumberFormat(locale === "ar" ? "ar-EG-u-nu-latn" : "en-US", {
    maximumFractionDigits: 0,
  }).format(value);
}

const CURRENCY = { en: "EGP", ar: "ج" };

/**
 * The customer-facing price string for an offering.
 *
 *   FIXED         → "12,000 EGP"
 *   RANGE         → "12,000 – 18,000 EGP"
 *   PER_UNIT      → "from 2,500 EGP / m²"
 *   ON_INSPECTION → "Quoted after inspection"
 *
 * Returns a plain string. Anything that needs a badge (ON_INSPECTION) can check
 * `isQuoteOnly` rather than parsing this back.
 */
export function formatPrice(
  offering: Pick<Offering, "pricingModel" | "priceMin" | "priceMax" | "unit">,
  locale: Locale,
): string {
  const cur = CURRENCY[locale];
  const { pricingModel, priceMin, priceMax, unit } = offering;

  if (pricingModel === "ON_INSPECTION") {
    return locale === "ar" ? "السعر يتحدد بعد المعاينة" : "Quoted after inspection";
  }

  // A price-bearing model with no number is a data problem, not something to
  // render as "0 EGP" — that would read as free.
  if (priceMin == null) {
    return locale === "ar" ? "السعر غير محدد" : "Price not set";
  }

  const min = formatAmount(priceMin, locale);

  if (pricingModel === "PER_UNIT") {
    const from = locale === "ar" ? "من" : "from";
    const u = unitLabel(unit, locale);
    return `${from} ${min} ${cur}${u ? ` / ${u}` : ""}`;
  }

  if (pricingModel === "RANGE" && priceMax != null && priceMax !== priceMin) {
    return `${min} – ${formatAmount(priceMax, locale)} ${cur}`;
  }

  return `${min} ${cur}`;
}

/** True when there is no number to show and the price is settled on site. */
export function isQuoteOnly(offering: Pick<Offering, "pricingModel">): boolean {
  return offering.pricingModel === "ON_INSPECTION";
}

/** Short label for a tier's quantity band: "1–3", "4+", "up to 10". */
export function formatQtyRange(
  tier: { qtyMin: number | null; qtyMax: number | null },
  locale: Locale,
): string {
  const { qtyMin, qtyMax } = tier;
  if (qtyMin == null && qtyMax == null) return "";
  if (qtyMin != null && qtyMax == null) return `${formatAmount(qtyMin, locale)}+`;
  if (qtyMin == null && qtyMax != null) {
    return locale === "ar"
      ? `حتى ${formatAmount(qtyMax, locale)}`
      : `up to ${formatAmount(qtyMax, locale)}`;
  }
  if (qtyMin === qtyMax) return formatAmount(qtyMin!, locale);
  return `${formatAmount(qtyMin!, locale)} – ${formatAmount(qtyMax!, locale)}`;
}

/**
 * How stale the prices are. The plan nudges a provider to revisit prices after
 * 90 days — an ageing price list quietly loses the customer's trust when the
 * quote that follows does not match what the page said.
 */
export const PRICE_STALE_DAYS = 90;

export function priceAgeDays(priceUpdatedAt: number | null): number | null {
  if (!priceUpdatedAt) return null;
  return Math.floor((Date.now() - priceUpdatedAt) / 86_400_000);
}

export function isPriceStale(priceUpdatedAt: number | null): boolean {
  const age = priceAgeDays(priceUpdatedAt);
  return age !== null && age >= PRICE_STALE_DAYS;
}

export const PRICING_MODEL_LABELS: Record<PricingModel, { en: string; ar: string }> = {
  FIXED: { en: "Fixed price", ar: "سعر ثابت" },
  RANGE: { en: "Price range", ar: "نطاق سعري" },
  PER_UNIT: { en: "Per unit", ar: "سعر بالوحدة" },
  ON_INSPECTION: { en: "Quoted after inspection", ar: "يتحدد بعد المعاينة" },
};

export const PRICE_UNITS: PriceUnit[] = [
  "SQM", "METER", "PIECE", "DOOR", "WINDOW", "ROOM", "APARTMENT", "HOUR", "DAY", "JOB",
];

// ── Request totals ───────────────────────────────────────────────────────────
//
// A MIRROR of api/src/lib/services/pricing.ts. That one is the authority — its
// numbers are what get persisted on the Lead. This copy exists so the customer
// sees the total update as they build the request, without a round trip per
// checkbox.
//
// Two implementations drift. `pricing-cases.json` at the repo root is the guard:
// a test on each side runs the same fixtures through its own implementation. If
// you change the maths here, change it there, and add a case first.

export type PricedItemInput = {
  qty: number;
  pricingModel: PricingModel;
  unitPriceMin: number | null;
  unitPriceMax: number | null;
};

export type BundleRuleInput = { minItems: number; discountPercent: number };

export interface PricingResult {
  /** null (not 0) when nothing in the request carries a price. */
  subtotalMin: number | null;
  subtotalMax: number | null;
  totalMin: number | null;
  totalMax: number | null;
  discountPercent: number;
  hasOnInspection: boolean;
  pricedCount: number;
  lines: { lineMin: number | null; lineMax: number | null }[];
}

/** Highest discount among the rules the basket qualifies for. 0 when none do. */
export function bestDiscount(rules: BundleRuleInput[], itemCount: number): number {
  return rules
    .filter((r) => itemCount >= r.minItems)
    .reduce((best, r) => Math.max(best, r.discountPercent), 0);
}

/**
 * Total a request. Keep in lockstep with the backend implementation.
 *
 * Inspection items are excluded by their MODEL, not by having a null price — a
 * priced model with a missing price is a data problem, and folding it in as free
 * would bury it. The bundle threshold counts every selected item while the
 * discount only reduces the priced amount.
 */
export function calculateRequest(
  items: PricedItemInput[],
  bundleRules: BundleRuleInput[],
): PricingResult {
  const priced = items.filter((i) => i.pricingModel !== "ON_INSPECTION");
  const hasOnInspection = items.some((i) => i.pricingModel === "ON_INSPECTION");

  const lines = items.map((item) => {
    if (item.pricingModel === "ON_INSPECTION" || item.unitPriceMin == null) {
      return { lineMin: null, lineMax: null };
    }
    const qty = Math.max(1, Math.trunc(item.qty) || 1);
    const max = item.unitPriceMax ?? item.unitPriceMin;
    return { lineMin: qty * item.unitPriceMin, lineMax: qty * max };
  });

  if (priced.length === 0) {
    return {
      subtotalMin: null, subtotalMax: null,
      totalMin: null, totalMax: null,
      discountPercent: 0, hasOnInspection, pricedCount: 0, lines,
    };
  }

  const subtotalMin = lines.reduce((sum, l) => sum + (l.lineMin ?? 0), 0);
  const subtotalMax = lines.reduce((sum, l) => sum + (l.lineMax ?? 0), 0);
  const discountPercent = bestDiscount(bundleRules, items.length);
  const factor = 1 - discountPercent / 100;

  return {
    subtotalMin,
    subtotalMax,
    totalMin: Math.round(subtotalMin * factor),
    totalMax: Math.round(subtotalMax * factor),
    discountPercent,
    hasOnInspection,
    pricedCount: priced.length,
    lines,
  };
}

/** The estimate line for a request summary. */
export function formatEstimate(result: PricingResult, locale: Locale): string {
  if (result.totalMin == null) {
    return locale === "ar" ? "السعر يتحدد بعد المعاينة" : "Quoted after inspection";
  }
  const cur = locale === "ar" ? "ج" : "EGP";
  if (result.totalMax != null && result.totalMax !== result.totalMin) {
    return `${formatAmount(result.totalMin, locale)} – ${formatAmount(result.totalMax, locale)} ${cur}`;
  }
  return `${formatAmount(result.totalMin, locale)} ${cur}`;
}
