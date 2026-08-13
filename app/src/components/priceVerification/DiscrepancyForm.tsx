import { useState } from "react";
import { t, type Locale } from "../../lib/i18n";
import { CURRENCY, formatEgp } from "../../lib/pricing";
import type { LeadCompletion } from "../../lib/requests";

/** Mockup's "cDiff" state: the client's own final amount + optional explanation. */
export default function DiscrepancyForm({
  completion, busy, error, onSubmit, onBack, locale,
}: {
  completion: LeadCompletion;
  busy: boolean;
  error?: string;
  onSubmit: (clientAmount: number, note: string) => void;
  onBack: () => void;
  locale: Locale;
}) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [amountError, setAmountError] = useState<string | undefined>();

  function handleSubmit() {
    const n = Number(amount);
    if (amount.trim() === "" || !Number.isFinite(n) || n < 0) {
      setAmountError(t(locale, "verify_error_amount"));
      return;
    }
    setAmountError(undefined);
    onSubmit(Math.round(n), note.trim());
  }

  return (
    <div className="bg-surface-container-lowest border border-outline-variant/40 rounded-3xl p-6 sm:p-8">
      <h2 className="font-black text-title text-on-surface mb-2">{t(locale, "verify_diff_title")}</h2>
      <p className="text-label text-outline mb-5 max-w-md">{t(locale, "verify_diff_sub")}</p>

      <div className="flex items-center justify-between border border-outline-variant/20 bg-surface-container rounded-xl px-4 py-3.5 mb-5">
        <span className="text-label text-outline">{t(locale, "verify_amount_reported")}</span>
        <span className="font-medium text-label text-on-surface [font-variant-numeric:tabular-nums]">{formatEgp(completion.finalTotal, locale)}</span>
      </div>

      <label className="block text-label font-bold text-on-surface mb-1.5">{t(locale, "verify_diff_amount_label")}</label>
      <div className="border-2 border-primary rounded-xl px-4 py-3.5 flex items-baseline gap-2.5 mb-1">
        <span className="font-bold text-label text-primary flex-shrink-0">{CURRENCY[locale]}</span>
        <input
          type="number" inputMode="numeric" min={0} step={1}
          value={amount} onChange={(e) => setAmount(e.target.value)}
          onWheel={(e) => e.currentTarget.blur()}
          placeholder="0"
          className="flex-1 min-w-0 bg-transparent border-none outline-none focus:ring-0 font-bold text-title text-on-surface [font-variant-numeric:tabular-nums] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
      </div>
      {amountError && <p className="text-label text-error font-medium mb-4">{amountError}</p>}

      <label className="block text-label font-bold text-on-surface mt-4 mb-1.5">
        {t(locale, "verify_diff_note_label")} <span className="text-outline font-normal">{t(locale, "completion_optional")}</span>
      </label>
      <textarea
        className="field-input w-full resize-none" rows={3} maxLength={2000}
        value={note} onChange={(e) => setNote(e.target.value)}
        placeholder={t(locale, "verify_diff_note_ph")}
      />
      <p className="mt-2.5 text-caption text-outline">{t(locale, "verify_diff_footer")}</p>

      {error && <p className="text-label text-error font-medium mt-3">{error}</p>}

      <div className="flex gap-3 mt-5">
        <button
          type="button" onClick={handleSubmit} disabled={busy}
          className="flex-1 bg-primary text-on-primary rounded-xl py-3.5 text-center font-bold text-label hover:bg-primary-container transition-colors touch-press btn-press disabled:opacity-60"
        >
          {busy ? t(locale, "verify_submitting") : t(locale, "verify_diff_submit")}
        </button>
        <button
          type="button" onClick={onBack} disabled={busy}
          className="border border-outline-variant/50 rounded-xl px-5 py-3.5 font-medium text-label text-on-surface hover:border-outline-variant transition-colors disabled:opacity-60"
        >
          {t(locale, "verify_diff_back")}
        </button>
      </div>
    </div>
  );
}
