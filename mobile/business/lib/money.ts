import type { ApiOffering, ApiPriceUnit } from "@alassema/core";

/**
 * "12,000 ج" — whole Egyptian pounds, no piastres (matches api's own
 * convention — see ApiOffering's comment in packages/core/apiTypes.ts).
 * Same Intl.NumberFormat locale as mobile/client's lib/pricing.ts formatEgp,
 * kept as its own one-liner here rather than pulled in from that file: the
 * rest of pricing.ts is customer-facing offering-preview math this app has
 * no use for, and duplicating one formatter is cheaper than importing that
 * coupling.
 */
export function formatEgp(amount: number): string {
  return `${new Intl.NumberFormat("ar-EG-u-nu-latn", { maximumFractionDigits: 0 }).format(amount)} ج`;
}

// Same labels as mobile/client's lib/pricing.ts UNIT_LABELS — kept in sync
// by hand rather than shared, for the same one-function-is-cheaper-than-a-
// coupling reason as formatEgp above.
const UNIT_LABELS: Record<ApiPriceUnit, string> = {
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

export function unitLabel(unit: ApiPriceUnit | string | null): string {
  if (!unit) return "";
  return UNIT_LABELS[unit as ApiPriceUnit] ?? String(unit);
}

/** "12,000 ج" / "من 2,500 ج – 5,000 ج" / "من 2,500 ج / م²" / "السعر يتحدد
 *  بعد المعاينة" — the provider-facing counterpart of mobile/client's
 *  lib/pricing.ts formatPrice, same pricing-model branches. */
export function formatOfferingPrice(
  offering: Pick<ApiOffering, "pricingModel" | "priceMin" | "priceMax" | "unit">,
): string {
  const { pricingModel, priceMin, priceMax, unit } = offering;

  if (pricingModel === "ON_INSPECTION") return "السعر يتحدد بعد المعاينة";
  if (priceMin == null) return "السعر غير محدد";

  if (pricingModel === "PER_UNIT") {
    const u = unitLabel(unit);
    return `من ${formatEgp(priceMin)}${u ? ` / ${u}` : ""}`;
  }
  if (pricingModel === "RANGE" && priceMax != null && priceMax !== priceMin) {
    return `من ${formatEgp(priceMin)} – ${formatEgp(priceMax)}`;
  }
  return formatEgp(priceMin);
}
