import { Link } from "react-router-dom";
import { useLocale } from "../context/LocaleContext";
import { t } from "../lib/i18n";
import { useCart } from "../lib/cart";
import { calculateRequest, formatEstimate } from "../lib/pricing";
import type { Offering, BundleRule } from "../lib/offerings";

/**
 * Floating summary of the current basket on a company profile.
 *
 * Uses `.compare-bar-offset` (index.css) so it clears the mobile bottom nav and
 * the iOS home indicator — a fixed bar without it sits under both.
 *
 * The total shown here comes from the frontend mirror of the pricing maths. The
 * server recomputes it on submit and that result is what gets stored; the two are
 * held together by pricing-cases.json.
 */
export default function RequestBar({ companySlug, offerings, bundleRules, requestHref }: {
  companySlug: string;
  offerings: Offering[];
  bundleRules: BundleRule[];
  requestHref: string;
}) {
  const { locale } = useLocale();
  const { items } = useCart(companySlug);

  if (items.length === 0) return null;

  const byId = new Map(offerings.map((o) => [o.id, o]));

  // Resolve each basket line to the price the customer is currently being shown.
  const priced = items.flatMap((item) => {
    const offering = byId.get(item.offeringId);
    if (!offering) return []; // offering vanished (unpublished/hidden) — drop it
    const tier = item.tierId ? offering.tiers.find((t) => t.id === item.tierId) : undefined;
    return [{
      qty: item.qty,
      pricingModel: offering.pricingModel,
      unitPriceMin: tier ? tier.priceMin : offering.priceMin,
      unitPriceMax: tier ? tier.priceMax : offering.priceMax,
    }];
  });

  const result = calculateRequest(priced, bundleRules);
  const n = priced.length;
  if (n === 0) return null;

  const itemLabel = `${n} ${t(locale, n === 1 ? "offer_item_one" : "offer_item_many")}`;

  return (
    <div className="fixed left-0 right-0 z-40 px-4 compare-bar-offset pointer-events-none">
      <div className="max-w-3xl mx-auto pointer-events-auto bg-surface-container-lowest/97 backdrop-blur-xl border border-outline-variant/25 rounded-2xl shadow-[0_8px_28px_-8px_rgba(0,0,0,0.18)] px-4 py-3 flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-bold text-outline">{itemLabel}</p>
          <p className="font-display font-black text-[15px] text-on-surface leading-tight truncate">
            {formatEstimate(result, locale)}
          </p>
          {/* Both facts matter and neither is obvious: the discount only reduces
              the priced part, and an estimate with inspection items in it is not
              the whole job. */}
          <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-outline">
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
          className="flex items-center gap-1.5 bg-primary text-on-primary px-4 py-2.5 rounded-xl font-bold text-[14px] hover:bg-primary-container transition-colors flex-shrink-0 touch-press btn-press"
        >
          {t(locale, "offer_continue")}
          <span className="material-symbols-outlined text-[18px] rtl-flip">arrow_forward</span>
        </Link>
      </div>
    </div>
  );
}
