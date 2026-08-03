import { Link } from "react-router-dom";
import { useLocale } from "../context/LocaleContext";
import { t, tCount } from "../lib/i18n";
import { calculateRequest, formatEstimate, type PricingResult } from "../lib/pricing";
import type { CartItem } from "../lib/cart";
import type { Offering, BundleRule } from "../lib/offerings";
import Icon from "./Icon";

export interface BasketSummary {
  result: PricingResult;
  /** Count of lines actually priced — excludes any vanished (unpublished/hidden) offering. */
  itemCount: number;
}

/**
 * Prices the current basket, or returns null when there is nothing to show —
 * either the basket is empty, or every line's offering has since vanished
 * (unpublished/hidden). Shared by the desktop floating card and the mobile
 * merged bar (CP-03) so both agree on when a basket summary exists at all.
 */
export function deriveBasketSummary(
  items: CartItem[],
  offerings: Offering[],
  bundleRules: BundleRule[],
): BasketSummary | null {
  if (items.length === 0) return null;
  const byId = new Map(offerings.map((o) => [o.id, o]));
  const priced = items.flatMap((item) => {
    const offering = byId.get(item.offeringId);
    if (!offering) return []; // offering vanished (unpublished/hidden) — drop it
    const tier = item.tierId ? offering.tiers.find((tr) => tr.id === item.tierId) : undefined;
    return [{
      qty: item.qty,
      pricingModel: offering.pricingModel,
      unitPriceMin: tier ? tier.priceMin : offering.priceMin,
      unitPriceMax: tier ? tier.priceMax : offering.priceMax,
    }];
  });
  if (priced.length === 0) return null;
  return { result: calculateRequest(priced, bundleRules), itemCount: priced.length };
}

/**
 * Basket total + "Continue" — the shared content for both the desktop
 * floating card and the mobile bottom bar, which merges this straight into
 * the sticky CTA bar instead of stacking a second blurred bar above it
 * (PERF-04/CP-03; see CompanyProfile.tsx).
 */
export function RequestBarContent({ summary, requestHref }: {
  summary: BasketSummary;
  requestHref: string;
}) {
  const { result, itemCount } = summary;
  const { locale } = useLocale();
  const itemLabel = `${itemCount} ${tCount(locale, "noun_offer_item", itemCount)}`;

  return (
    <>
      <div className="min-w-0 flex-1">
        <p className="text-caption font-bold text-outline">{itemLabel}</p>
        <p className="font-display font-black text-body text-on-surface leading-tight truncate">
          {formatEstimate(result, locale)}
        </p>
        {/* Both facts matter and neither is obvious: the discount only reduces
            the priced part, and an estimate with inspection items in it is not
            the whole job. */}
        <div className="flex flex-wrap items-center gap-x-2 text-caption text-outline">
          {result.discountPercent > 0 && (
            <span className="text-primary font-bold">
              {t(locale, "offer_bundle_discount")} {result.discountPercent}
              {locale === "ar" ? "٪" : "%"} {t(locale, "offer_bundle_on_priced")}
            </span>
          )}
          {result.hasOnInspection && (
            <span>{t(locale, "offer_plus_inspection_short")}</span>
          )}
        </div>
      </div>

      <Link
        to={requestHref}
        className="flex items-center gap-1.5 bg-primary text-on-primary px-4 py-2.5 rounded-xl font-bold text-label hover:bg-primary-container transition-colors flex-shrink-0 touch-press btn-press"
      >
        {t(locale, "offer_continue")}
        <Icon name="arrow_forward" className="text-subhead rtl-flip" />
      </Link>
    </>
  );
}

/**
 * Desktop-only floating basket summary. Mobile merges the same content into
 * the sticky CTA bar instead (PERF-04: a separate blurred card here would
 * stack with the CTA bar AND the bottom tab bar — three backdrop-filters
 * doing work over a scrolling, image-heavy page for no visual gain, since the
 * CTA bar and bottom nav already read as solid at 96-97% opacity).
 */
export default function RequestBar({ items, offerings, bundleRules, requestHref }: {
  items: CartItem[];
  offerings: Offering[];
  bundleRules: BundleRule[];
  requestHref: string;
}) {
  const summary = deriveBasketSummary(items, offerings, bundleRules);
  if (!summary) return null;

  return (
    <div className="hidden md:block fixed left-0 right-0 z-40 px-4 compare-bar-offset pointer-events-none">
      <div className="max-w-3xl mx-auto pointer-events-auto bg-surface-container-lowest/97 backdrop-blur-xl border border-outline-variant/25 rounded-2xl shadow-bloom px-4 py-3 flex items-center gap-3">
        <RequestBarContent summary={summary} requestHref={requestHref} />
      </div>
    </div>
  );
}
