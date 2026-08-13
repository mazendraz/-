import { t, type Locale } from "../../lib/i18n";
import { formatEgp } from "../../lib/pricing";
import Icon from "../Icon";
import type { Lead, LeadCompletion } from "../../lib/requests";

/**
 * Mockup's "cConfirmed" state — shown after EITHER a confirm or a discrepancy
 * submit, but the copy must not claim more than actually happened: a
 * discrepancy report isn't "confirmed" as final, it's recorded for admin
 * review (see the task's neutral-tone requirement — no implied agreement,
 * no accusation either).
 */
export default function ConfirmationState({
  lead, completion, onContinue, locale,
}: {
  lead: Lead;
  completion: LeadCompletion;
  onContinue: () => void;
  locale: Locale;
}) {
  const amount = completion.clientAmount ?? completion.finalTotal;
  const isDiscrepancy = completion.verificationStatus === "DISCREPANCY";
  return (
    <div className="bg-surface-container-lowest border border-outline-variant/40 rounded-3xl p-8 sm:p-11 text-center">
      <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5 ${isDiscrepancy ? "bg-primary/10" : "bg-success-container"}`}>
        <Icon name="check" className={`text-headline ${isDiscrepancy ? "text-primary" : "text-on-success-container"}`} />
      </div>
      <h2 className="font-black text-title text-on-surface mb-2.5">
        {t(locale, isDiscrepancy ? "verify_recorded_title" : "verify_confirmed_title")}
      </h2>
      <p className="text-label text-outline max-w-sm mx-auto mb-6">
        {t(locale, isDiscrepancy ? "verify_recorded_body_prefix" : "verify_confirmed_body_prefix")}{" "}
        <span className="text-on-surface font-medium [font-variant-numeric:tabular-nums]">{formatEgp(amount, locale)}</span>.
      </p>
      <div className="border border-outline-variant/20 rounded-2xl bg-surface-container px-4 py-3.5 flex items-center justify-between mb-7">
        <span className="text-label text-outline">{lead.refNumber} · {lead.service}</span>
        <span className="text-caption font-bold text-primary bg-primary/10 rounded-full px-3 py-1.5">{t(locale, "lead_status_completed")}</span>
      </div>
      <button
        type="button" onClick={onContinue}
        className="bg-primary text-on-primary rounded-xl py-3.5 px-6 font-bold text-label hover:bg-primary-container transition-colors touch-press btn-press"
      >
        {t(locale, "verify_confirmed_continue")}
      </button>
    </div>
  );
}
