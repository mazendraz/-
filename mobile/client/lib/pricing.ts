/**
 * Price formatting for offerings — an Arabic-only subset of the website's
 * pricing.ts (this app is Arabic-only/RTL-forced, see lib/rtl.ts), covering
 * only the display half (formatPrice/unitLabel). The request-basket maths
 * (calculateRequest et al.) belongs to the priced-catalog request flow, which
 * is separate, larger, not-yet-built scope — see new-request/[slug]'s own
 * comment on why it's still the classic single-service form.
 */
import type { ApiOffering as Offering, ApiPriceUnit as PriceUnit } from "@alassema/core";

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
