/**
 * Price formatting + request-basket maths — an Arabic-only subset of the
 * website's pricing.ts (this app is Arabic-only/RTL-forced, see lib/rtl.ts).
 *
 * `calculateRequest`/`bestDiscount` are a PREVIEW mirror of the authoritative
 * server calculation (api's lib/services/pricing.ts, via leadItems.service's
 * resolveItems) — the server re-reads real prices and recomputes on submit;
 * what's here only exists so the total updates live as the customer picks
 * items, matching the website's own "two implementations, kept honest by
 * shared fixtures" caveat (see pricing-cases.json at the repo root).
 */
import type {
  ApiOffering as Offering,
  ApiPriceUnit as PriceUnit,
  ApiPricingModel as PricingModel,
} from "@alassema/core";

const UNIT_LABELS: Record<PriceUnit, string> = {
  SQM: "م²",
  METER: "م",
  PIECE: "قطعة",
  DOOR: "باب",
  WINDOW: "شباك",
  ROOM: "غرفة",
  APARTMENT: "شقة",
  HOUR: "ساعة",
  DAY: "يوم",
  JOB: "المهمة",
};

export function unitLabel(unit: PriceUnit | string | null): string {
  if (!unit) return "";
  const entry = UNIT_LABELS[unit as PriceUnit];
  return entry ?? String(unit);
}

function formatAmount(value: number): string {
  return new Intl.NumberFormat("ar-EG-u-nu-latn", { maximumFractionDigits: 0 }).format(value);
}

/** "12,000 ج" / "من 2,500 ج / م²" / "السعر يتحدد بعد المعاينة" */
export function formatPrice(
  offering: Pick<Offering, "pricingModel" | "priceMin" | "priceMax" | "unit">,
): string {
  const { pricingModel, priceMin, priceMax, unit } = offering;

  if (pricingModel === "ON_INSPECTION") return "السعر يتحدد بعد المعاينة";
  if (priceMin == null) return "السعر غير محدد";

  const min = formatAmount(priceMin);

  if (pricingModel === "PER_UNIT") {
    const u = unitLabel(unit);
    return `من ${min} ج${u ? ` / ${u}` : ""}`;
  }

  if (pricingModel === "RANGE" && priceMax != null && priceMax !== priceMin) {
    return `${min} – ${formatAmount(priceMax)} ج`;
  }

  return `${min} ج`;
}

export function isQuoteOnly(offering: Pick<Offering, "pricingModel">): boolean {
  return offering.pricingModel === "ON_INSPECTION";
}

/** Short label for a tier's quantity band: "١–٣", "٤+", "حتى ١٠". */
export function formatQtyRange(tier: { qtyMin: number | null; qtyMax: number | null }): string {
  const { qtyMin, qtyMax } = tier;
  if (qtyMin == null && qtyMax == null) return "";
  if (qtyMin != null && qtyMax == null) return `${formatAmount(qtyMin)}+`;
  if (qtyMin == null && qtyMax != null) return `حتى ${formatAmount(qtyMax)}`;
  if (qtyMin === qtyMax) return formatAmount(qtyMin!);
  return `${formatAmount(qtyMin!)} – ${formatAmount(qtyMax!)}`;
}

// ── Request totals — mirrors api's lib/services/pricing.ts ──────────────────

export type PricedItemInput = {
  qty: number;
  pricingModel: PricingModel;
  unitPriceMin: number | null;
  unitPriceMax: number | null;
};

export type BundleRuleInput = { minItems: number; discountPercent: number };

export interface PricingResult {
  totalMin: number | null;
  totalMax: number | null;
  discountPercent: number;
  hasOnInspection: boolean;
  pricedCount: number;
}

/** Highest discount among the rules the basket qualifies for. 0 when none do. */
export function bestDiscount(rules: BundleRuleInput[], itemCount: number): number {
  return rules
    .filter((r) => itemCount >= r.minItems)
    .reduce((best, r) => Math.max(best, r.discountPercent), 0);
}

/** Total a basket of selected items. Keep in lockstep with the backend. */
export function calculateRequest(items: PricedItemInput[], bundleRules: BundleRuleInput[]): PricingResult {
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
    return { totalMin: null, totalMax: null, discountPercent: 0, hasOnInspection, pricedCount: 0 };
  }

  const subtotalMin = lines.reduce((sum, l) => sum + (l.lineMin ?? 0), 0);
  const subtotalMax = lines.reduce((sum, l) => sum + (l.lineMax ?? 0), 0);
  const discountPercent = bestDiscount(bundleRules, items.length);
  const factor = 1 - discountPercent / 100;

  return {
    totalMin: Math.round(subtotalMin * factor),
    totalMax: Math.round(subtotalMax * factor),
    discountPercent,
    hasOnInspection,
    pricedCount: priced.length,
  };
}

/** "١٢,٠٠٠ – ١٨,٠٠٠ ج" / "السعر يتحدد بعد المعاينة" */
export function formatEstimate(result: PricingResult): string {
  if (result.totalMin == null) return "السعر يتحدد بعد المعاينة";
  if (result.totalMax != null && result.totalMax !== result.totalMin) {
    return `${formatAmount(result.totalMin)} – ${formatAmount(result.totalMax)} ج`;
  }
  return `${formatAmount(result.totalMin)} ج`;
}
