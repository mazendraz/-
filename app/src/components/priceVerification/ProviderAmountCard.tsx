import { t, type Locale } from "../../lib/i18n";
import { formatEgp } from "../../lib/pricing";
import type { LeadCompletion } from "../../lib/requests";

/** Mockup's "cReview" state: the amount the provider reported + confirm/dispute. */
export default function ProviderAmountCard({
  completion, busy, error, onConfirm, onDispute, locale,
}: {
  completion: LeadCompletion;
  busy: boolean;
  error?: string;
  onConfirm: () => void;
  onDispute: () => void;
  locale: Locale;
}) {
  const hasExtra = completion.additionalWorkAmount != null && completion.additionalWorkAmount > 0;
  return (
    <div className="bg-surface-container-lowest border border-outline-variant/40 rounded-3xl p-7 sm:p-9 text-center">
      <p className="text-caption font-bold tracking-wide text-outline uppercase">{t(locale, "verify_amount_reported")}</p>
      <p className="mt-3 font-black text-display text-on-surface [font-variant-numeric:tabular-nums]">
        {formatEgp(completion.finalTotal, locale)}
      </p>
      {hasExtra && (
        <div className="inline-block mt-3 bg-primary/10 rounded-full px-3.5 py-1.5 text-label text-primary">
          {t(locale, "verify_breakdown_initial")} {formatEgp(completion.providerAmount, locale)}
          {" · "}
          {t(locale, "verify_breakdown_extra")} {formatEgp(completion.additionalWorkAmount ?? 0, locale)}
        </div>
      )}

      <div className="h-px bg-outline-variant/20 my-7" />

      <p className="font-bold text-subhead text-on-surface mb-5">{t(locale, "verify_question")}</p>
      {error && <p className="text-label text-error font-medium mb-4">{error}</p>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
        <button
          type="button" onClick={onConfirm} disabled={busy}
          className="bg-primary text-on-primary rounded-2xl py-4 px-5 font-bold text-label hover:bg-primary-container transition-colors touch-press btn-press disabled:opacity-60"
        >
          {"✓ "}{t(locale, "verify_yes")}
        </button>
        <button
          type="button" onClick={onDispute} disabled={busy}
          className="border border-outline-variant rounded-2xl py-4 px-5 font-medium text-label text-on-surface hover:border-primary hover:text-primary transition-colors disabled:opacity-60"
        >
          {t(locale, "verify_no")}
        </button>
      </div>
      <p className="mt-5 text-caption text-outline max-w-md mx-auto">{t(locale, "verify_footer_note")}</p>
    </div>
  );
}
