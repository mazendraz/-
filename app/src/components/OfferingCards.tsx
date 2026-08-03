import { useLocale } from "../context/LocaleContext";
import { t } from "../lib/i18n";
import { formatPrice, formatQtyRange, isQuoteOnly, isPriceStale, priceAgeDays } from "../lib/pricing";
import { splitByKind, type Offering } from "../lib/offerings";
import { addToCart, removeFromCart, useCart } from "../lib/cart";
import Icon from "./Icon";

/**
 * The public price list on a company profile.
 *
 * Falls back to the legacy `services` string list when a company has no
 * offerings yet. Company.services is still the source for anyone the Feature B
 * backfill hasn't reached and for demo mode, so dropping the fallback would
 * empty those profiles — the column stays until this has been live a while.
 */
export default function OfferingCards({ offerings, services, companySlug }: {
  offerings: Offering[];
  services: string[];
  /** Omit to render read-only cards (no "add to request" buttons). */
  companySlug?: string;
}) {
  const { locale } = useLocale();

  if (offerings.length === 0) {
    if (services.length === 0) return null;
    return (
      <section>
        <h2 className=" text-title text-on-surface mb-4">
          {t(locale, "profile_services_offered")}
        </h2>
        <div className="flex flex-wrap gap-3">
          {services.map((s) => (
            <div key={s} className="flex items-center gap-2 bg-surface-container-lowest border border-outline-variant/20 rounded-xl px-4 py-2.5 shadow-sm">
              <Icon name="check_circle" className="text-primary text-subhead" style={{ fontVariationSettings: "'FILL' 1" }} />
              <span className="text-label text-on-surface">{s}</span>
            </div>
          ))}
        </div>
      </section>
    );
  }

  const { services: svc, products } = splitByKind(offerings);

  return (
    <div className="space-y-8">
      {svc.length > 0 && (
        <OfferingGroup title={t(locale, "profile_services_offered")} items={svc} companySlug={companySlug} />
      )}
      {products.length > 0 && (
        <OfferingGroup title={t(locale, "profile_products")} items={products} companySlug={companySlug} />
      )}
    </div>
  );
}

function OfferingGroup({ title, items, companySlug }: {
  title: string; items: Offering[]; companySlug?: string;
}) {
  return (
    <section>
      <h2 className=" text-title text-on-surface mb-4">{title}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {items.map((o) => <OfferingCard key={o.id} offering={o} companySlug={companySlug} />)}
      </div>
    </section>
  );
}

function OfferingCard({ offering, companySlug }: { offering: Offering; companySlug?: string }) {
  const { locale } = useLocale();
  const quote = isQuoteOnly(offering);
  const stale = isPriceStale(offering.priceUpdatedAt);
  const { items } = useCart(companySlug ?? "");
  const inCart = items.some((i) => i.offeringId === offering.id);

  return (
    <div className="bg-surface-container-lowest border border-outline-variant/20 rounded-2xl overflow-hidden shadow-sm flex flex-col">
      {offering.image && (
        <img src={offering.image} alt="" className="w-full h-32 object-cover" loading="lazy" width={320} height={128} />
      )}
      <div className="p-4 flex flex-col gap-2 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-bold text-body text-on-surface leading-snug">{offering.name}</h3>
          {quote && (
            <span className="text-caption font-bold px-2 py-0.5 rounded-full bg-secondary/15 text-secondary flex-shrink-0 whitespace-nowrap">
              {t(locale, "offer_on_inspection")}
            </span>
          )}
        </div>

        {offering.description && (
          <p className="text-label text-on-surface-variant leading-relaxed">{offering.description}</p>
        )}

        {/* Quantity tiers, when the provider defined bands. */}
        {offering.tiers.length > 0 && (
          <div className="flex flex-col gap-1 mt-0.5">
            {offering.tiers.map((tier) => (
              <div key={tier.id} className="flex items-center justify-between gap-2 text-caption bg-surface-container rounded-lg px-2.5 py-1.5">
                <span className="text-on-surface-variant truncate">
                  {tier.label}
                  {formatQtyRange(tier, locale) && ` · ${formatQtyRange(tier, locale)}`}
                </span>
                {tier.priceMin != null && (
                  <span className="font-bold text-on-surface flex-shrink-0">
                    {formatPrice(
                      { pricingModel: tier.priceMax != null && tier.priceMax !== tier.priceMin ? "RANGE" : "FIXED",
                        priceMin: tier.priceMin, priceMax: tier.priceMax, unit: null },
                      locale,
                    )}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="mt-auto pt-2 flex items-end justify-between gap-2">
          <div>
            <p className={`font-display font-black leading-none ${quote ? "text-label text-secondary" : "text-subhead text-primary"}`}>
              {formatPrice(offering, locale)}
            </p>
            {offering.minQty != null && (
              <p className="text-caption text-outline mt-1">
                {t(locale, "offer_minimum")} {offering.minQty}
              </p>
            )}
          </div>

          {companySlug && (
            <button
              onClick={() =>
                inCart
                  ? removeFromCart(companySlug, offering.id)
                  : addToCart(companySlug, { offeringId: offering.id, qty: offering.minQty ?? 1 })
              }
              aria-pressed={inCart}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-caption font-bold transition-colors flex-shrink-0 touch-press ${
                inCart
                  ? "bg-primary/10 text-primary"
                  : "bg-surface-container text-on-surface hover:bg-surface-container-high"
              }`}
            >
              <span className="material-symbols-outlined text-body" aria-hidden="true" translate="no">{inCart ? "check" : "add"}</span>
              {t(locale, inCart ? "offer_added" : "offer_add")}
            </button>
          )}
        </div>

        {offering.note && (
          <p className="text-caption text-outline italic">{offering.note}</p>
        )}

        {/* Honest about age rather than implying a stale number is current. */}
        {stale && !quote && (
          <p className="text-caption text-outline flex items-center gap-1">
            <Icon name="schedule" className="text-label" />
            {t(locale, "offer_price_updated")} {priceAgeDays(offering.priceUpdatedAt)}{" "}
            {t(locale, "offer_days_ago")}
          </p>
        )}
      </div>
    </div>
  );
}
