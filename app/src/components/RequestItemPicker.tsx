import { useLocale } from "../context/LocaleContext";
import { t } from "../lib/i18n";
import { formatPrice, formatQtyRange, calculateRequest, formatEstimate } from "../lib/pricing";
import type { Offering, BundleRule } from "../lib/offerings";
import { type CartItem } from "../lib/cart";

/**
 * Multi-item selection for the request form: checkbox + quantity + tier per
 * offering, with a live estimate underneath.
 *
 * The estimate is computed by the frontend mirror of the pricing maths so it
 * updates as the customer changes things. The server recomputes it on submit
 * from its own catalogue and THAT is what gets stored — this is a preview, and
 * it says so.
 */
export default function RequestItemPicker({ offerings, bundleRules, value, onChange }: {
  offerings: Offering[];
  bundleRules: BundleRule[];
  value: CartItem[];
  onChange: (items: CartItem[]) => void;
}) {
  const { locale } = useLocale();
  const ar = locale === "ar";

  const selected = new Map(value.map((i) => [i.offeringId, i]));

  function toggle(offering: Offering) {
    if (selected.has(offering.id)) {
      onChange(value.filter((i) => i.offeringId !== offering.id));
    } else {
      onChange([...value, { offeringId: offering.id, qty: offering.minQty ?? 1, tierId: null }]);
    }
  }

  function patch(offeringId: string, changes: Partial<CartItem>) {
    onChange(value.map((i) => (i.offeringId === offeringId ? { ...i, ...changes } : i)));
  }

  const priced = value.flatMap((item) => {
    const offering = offerings.find((o) => o.id === item.offeringId);
    if (!offering) return [];
    const tier = item.tierId ? offering.tiers.find((t) => t.id === item.tierId) : undefined;
    return [{
      qty: item.qty,
      pricingModel: offering.pricingModel,
      unitPriceMin: tier ? tier.priceMin : offering.priceMin,
      unitPriceMax: tier ? tier.priceMax : offering.priceMax,
    }];
  });
  const result = calculateRequest(priced, bundleRules);

  if (offerings.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {offerings.map((offering) => {
          const item = selected.get(offering.id);
          const isSelected = !!item;
          return (
            <div
              key={offering.id}
              className={`rounded-xl border p-3 transition-colors ${
                isSelected ? "border-primary/40 bg-primary/5" : "border-outline-variant/25 bg-surface-container-lowest"
              }`}
            >
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggle(offering)}
                  className="mt-0.5 w-4 h-4 flex-shrink-0 accent-[color:var(--color-primary,#8a6a4f)]"
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-bold text-[14px] text-on-surface">{offering.name}</span>
                    <span className="text-[13px] font-bold text-primary flex-shrink-0">
                      {formatPrice(offering, locale)}
                    </span>
                  </span>
                  {offering.description && (
                    <span className="block text-[12px] text-outline mt-0.5 line-clamp-2">
                      {offering.description}
                    </span>
                  )}
                </span>
              </label>

              {isSelected && (
                <div className="flex flex-wrap items-center gap-3 mt-3 ps-7">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[12px] font-bold text-outline">
                      {t(locale, "offer_qty")}
                    </span>
                    <div className="flex items-center rounded-lg border border-outline-variant/30 overflow-hidden">
                      <button
                        type="button"
                        onClick={() => patch(offering.id, { qty: Math.max(1, item.qty - 1) })}
                        className="px-2 py-1 text-on-surface hover:bg-surface-container transition-colors"
                        aria-label={t(locale, "offer_decrease")}
                      >−</button>
                      <input
                        type="number" min={1} value={item.qty}
                        onChange={(e) => patch(offering.id, { qty: Math.max(1, Number(e.target.value) || 1) })}
                        className="w-14 text-center text-[13px] border-0 focus:outline-none bg-transparent"
                      />
                      <button
                        type="button"
                        onClick={() => patch(offering.id, { qty: item.qty + 1 })}
                        className="px-2 py-1 text-on-surface hover:bg-surface-container transition-colors"
                        aria-label={t(locale, "offer_increase")}
                      >+</button>
                    </div>
                  </div>

                  {offering.tiers.length > 0 && (
                    <label className="flex items-center gap-1.5">
                      <span className="text-[12px] font-bold text-outline">
                        {t(locale, "offer_option")}
                      </span>
                      <select
                        value={item.tierId ?? ""}
                        onChange={(e) => patch(offering.id, { tierId: e.target.value || null })}
                        className="field-input !w-auto !py-1.5 text-[13px]"
                      >
                        <option value="">{t(locale, "offer_standard_price")}</option>
                        {offering.tiers.map((tier) => (
                          <option key={tier.id} value={tier.id}>
                            {tier.label}
                            {formatQtyRange(tier, locale) ? ` (${formatQtyRange(tier, locale)})` : ""}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {value.length > 0 && (
        <div className="rounded-xl bg-surface-container p-4 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[13px] font-bold text-outline">
              {t(locale, "offer_estimated_total")}
            </span>
            <span className="font-display font-black text-[17px] text-on-surface">
              {formatEstimate(result, locale)}
            </span>
          </div>

          {result.discountPercent > 0 && (
            // Spelled out because it is genuinely surprising: an inspection item
            // helps you reach the threshold but there is nothing to discount on it.
            <p className="text-[12px] text-primary font-bold">
              {t(locale, "offer_bundle_discount")} {result.discountPercent}
              {locale === "ar" ? "٪" : "%"} {t(locale, "offer_bundle_on_priced")}
            </p>
          )}

          {result.hasOnInspection && (
            <p className="text-[12px] text-outline">
              {t(locale, "offer_plus_inspection")}
            </p>
          )}

          <p className="text-[11px] text-outline pt-1">
            {t(locale, "offer_estimate_note")}
          </p>
        </div>
      )}
    </div>
  );
}
