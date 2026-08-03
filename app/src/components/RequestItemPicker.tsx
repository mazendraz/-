import { useLocale } from "../context/LocaleContext";
import { t } from "../lib/i18n";
import { formatPrice, formatQtyRange, calculateRequest, formatEstimate } from "../lib/pricing";
import type { Offering, BundleRule } from "../lib/offerings";
import { type CartItem } from "../lib/cart";
import Icon from "./Icon";

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
              className={`rounded-2xl border p-3 transition-colors ${
                isSelected ? "border-primary/40 bg-primary/5" : "border-outline-variant/25 bg-surface-container-lowest"
              }`}
            >
              {/* Not a <label> — there's no real <input> to associate it with
                  anymore (see the custom indicator below). The whole row stays
                  clickable: onClick lives here, not just on the indicator, so
                  tapping the name/price/description also toggles selection,
                  same as the old label-wraps-checkbox behavior did. */}
              <div onClick={() => toggle(offering)} className="flex items-start gap-3 cursor-pointer">
                {/* Visually 24px, but padded out to a real 44px touch target on
                    mobile — the negative margin keeps the row's layout width
                    exactly what it was before this padding was added. The
                    button itself carries no onClick: a click or a keyboard
                    Enter/Space on it dispatches a native click that bubbles up
                    to the row's onClick above, so there's exactly one place
                    toggle() is called from, never two. */}
                <span className="p-2.5 -m-2.5 flex-shrink-0">
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={isSelected}
                    aria-label={offering.name}
                    className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors touch-press
                      ${isSelected ? "bg-primary border-primary" : "border-outline-variant/50 bg-surface-container-lowest"}`}
                  >
                    {isSelected && (
                      <Icon name="check" className="text-on-primary text-body" style={{ fontVariationSettings: "'FILL' 1" }} />
                    )}
                  </button>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-bold text-label text-on-surface">{offering.name}</span>
                    <span className="text-label font-bold text-primary flex-shrink-0">
                      {formatPrice(offering, locale)}
                    </span>
                  </span>
                  {offering.description && (
                    <span className="block text-caption text-outline mt-0.5 line-clamp-2">
                      {offering.description}
                    </span>
                  )}
                </span>
              </div>

              {isSelected && (offering.kind === "PRODUCT" || offering.tiers.length > 0) && (
                <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:gap-3 mt-3 ps-7">
                  {/* Quantity only makes sense for a physical product — a
                      service is booked once, not "×3". */}
                  {offering.kind === "PRODUCT" && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-caption font-bold text-outline">
                      {t(locale, "offer_qty")}
                    </span>
                    <div className="flex items-center rounded-full border border-outline-variant/30 overflow-hidden bg-surface-container-lowest">
                      <button
                        type="button"
                        onClick={() => patch(offering.id, { qty: Math.max(1, item.qty - 1) })}
                        className="w-9 h-9 flex items-center justify-center text-primary font-bold hover:bg-surface-container transition-colors touch-press"
                        aria-label={t(locale, "offer_decrease")}
                      >−</button>
                      <input
                        type="number" min={1} value={item.qty}
                        onChange={(e) => patch(offering.id, { qty: Math.max(1, Number(e.target.value) || 1) })}
                        // Hide the native up/down spinner — the +/− buttons
                        // already do that job; the browser's own arrows just
                        // duplicated them.
                        className="w-11 text-center text-label font-bold border-0 focus:outline-none bg-transparent [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                      <button
                        type="button"
                        onClick={() => patch(offering.id, { qty: item.qty + 1 })}
                        className="w-9 h-9 flex items-center justify-center text-primary font-bold hover:bg-surface-container transition-colors touch-press"
                        aria-label={t(locale, "offer_increase")}
                      >+</button>
                    </div>
                  </div>
                  )}

                  {offering.tiers.length > 0 && (
                    <label className="flex items-center gap-1.5">
                      <span className="text-caption font-bold text-outline">
                        {t(locale, "offer_option")}
                      </span>
                      <select
                        value={item.tierId ?? ""}
                        onChange={(e) => patch(offering.id, { tierId: e.target.value || null })}
                        className="field-input !w-auto !py-1.5 text-label"
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
        <div className="rounded-2xl bg-surface-container border-t-[3px] border-primary p-4 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-label font-bold text-outline">
              {t(locale, "offer_estimated_total")}
            </span>
            <span className="font-display font-black text-title text-primary">
              {formatEstimate(result, locale)}
            </span>
          </div>

          {result.discountPercent > 0 && (
            // Spelled out because it is genuinely surprising: an inspection item
            // helps you reach the threshold but there is nothing to discount on it.
            <p className="text-caption text-primary font-bold">
              {t(locale, "offer_bundle_discount")} {result.discountPercent}
              {locale === "ar" ? "٪" : "%"} {t(locale, "offer_bundle_on_priced")}
            </p>
          )}

          {result.hasOnInspection && (
            <p className="text-caption text-outline">
              {t(locale, "offer_plus_inspection")}
            </p>
          )}

          <p className="text-caption text-outline pt-1">
            {t(locale, "offer_estimate_note")}
          </p>
        </div>
      )}
    </div>
  );
}
