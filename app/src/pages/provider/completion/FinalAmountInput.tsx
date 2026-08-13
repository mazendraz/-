import { useLocale } from "../../../context/LocaleContext";
import { t } from "../../../lib/i18n";
import { CURRENCY } from "../../../lib/pricing";
import Icon from "../../../components/Icon";

/**
 * Step 1: the base/final service amount.
 *
 * When the lead was booked through the fixed catalog (real per-item prices,
 * not "quoted after inspection"), CompleteServicePage pre-fills `value` with
 * that known total so the provider isn't retyping a number the system
 * already has — they only need to confirm it or adjust it if the price
 * actually changed. `referenceLabel`/`referenceValue` show what that
 * pre-filled number came from; falls back to the customer's stated budget
 * bracket for classic QUOTE_ONLY leads, which have no per-item total.
 */
export default function FinalAmountInput({
  value, onChange, referenceLabel, referenceValue, prefilled, error, onContinue,
}: {
  value: string;
  onChange: (v: string) => void;
  referenceLabel: string;
  referenceValue: string;
  prefilled: boolean;
  error?: string;
  onContinue: () => void;
}) {
  const { locale } = useLocale();
  return (
    <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-2xl p-6 sm:p-7">
      <div className="font-bold text-label text-on-surface mb-5">{t(locale, "completion_amount_label")}</div>
      <div className="flex items-baseline gap-3 border-b-2 border-primary pb-3">
        <span className="font-bold text-title text-primary flex-shrink-0">{CURRENCY[locale]}</span>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          // A focused number input silently changes value on mouse-wheel
          // scroll in Chrome/Firefox — genuinely dangerous on a currency
          // amount (scroll the page, the price changes). Blurring on wheel
          // kills that without blocking normal page scroll.
          onWheel={(e) => e.currentTarget.blur()}
          placeholder="0"
          aria-label={t(locale, "completion_amount_label")}
          className="flex-1 min-w-0 bg-transparent border-none outline-none focus:ring-0 font-bold text-display text-on-surface [font-variant-numeric:tabular-nums] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
      </div>
      {error && <p className="text-label text-error font-medium mt-2">{error}</p>}
      {prefilled ? (
        <p className="mt-3 flex items-start gap-1.5 text-label text-primary">
          <Icon name="info" className="text-body flex-shrink-0" />
          {t(locale, "completion_amount_prefilled_hint")}
        </p>
      ) : (
        <p className="mt-3 text-label text-outline">{t(locale, "completion_amount_hint")}</p>
      )}
      <div className="mt-6 pt-5 border-t border-outline-variant/20 flex items-center justify-between gap-3 flex-wrap">
        {referenceValue ? (
          <span className="text-label text-outline">
            {referenceLabel}: <span className="text-on-surface font-medium">{referenceValue}</span>
          </span>
        ) : <span />}
        <button
          type="button"
          onClick={onContinue}
          className="bg-primary text-on-primary rounded-xl px-6 py-3.5 font-bold text-label hover:bg-primary-container transition-colors touch-press btn-press"
        >
          {t(locale, "completion_continue")}
        </button>
      </div>
    </div>
  );
}
