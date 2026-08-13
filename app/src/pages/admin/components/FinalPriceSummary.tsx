import { t, type Locale, type StringKey } from "../../../lib/i18n";
import { formatEgp } from "../../../lib/pricing";
import type { LeadCompletion, VerificationStatus } from "../../../lib/requests";

// Neutral by design (per the feature's authorization/tone requirements): a
// discrepancy is a recorded difference for admin review, styled with the
// existing `warning` token — never `error`/red, never framed as an accusation.
const STATUS_STYLE: Record<VerificationStatus, string> = {
  PENDING: "bg-surface-container text-outline",
  CONFIRMED: "bg-success-container text-on-success-container",
  DISCREPANCY: "bg-warning-container text-on-warning-container",
};

const STATUS_LABEL_KEY: Record<VerificationStatus, StringKey> = {
  PENDING: "admin_final_price_status_pending",
  CONFIRMED: "admin_final_price_status_confirmed",
  DISCREPANCY: "admin_final_price_status_discrepancy",
};

/**
 * Read-only "Final Price" block for the shared LeadModal (admin + provider) —
 * shown whenever the provider has submitted a completion (lead.completion set).
 */
export default function FinalPriceSummary({ completion, locale }: { completion: LeadCompletion; locale: Locale }) {
  const difference = completion.clientAmount != null ? completion.clientAmount - completion.finalTotal : null;

  return (
    <div className="border border-outline-variant/30 rounded-2xl p-4 bg-surface-container-lowest">
      <div className="flex items-center justify-between mb-3">
        <p className="text-caption font-bold text-outline uppercase tracking-wide">{t(locale, "admin_final_price_title")}</p>
        <span className={`text-caption font-bold px-2.5 py-1 rounded-full ${STATUS_STYLE[completion.verificationStatus]}`}>
          {t(locale, STATUS_LABEL_KEY[completion.verificationStatus])}
        </span>
      </div>
      <div className="flex flex-col gap-2">
        <Row label={t(locale, "admin_final_price_provider")} value={formatEgp(completion.finalTotal, locale)} />
        {completion.clientAmount != null && (
          <Row
            label={t(locale, completion.verificationStatus === "DISCREPANCY" ? "admin_final_price_client_reported" : "admin_final_price_client")}
            value={formatEgp(completion.clientAmount, locale)}
          />
        )}
        {difference != null && difference !== 0 && (
          <Row label={t(locale, "admin_final_price_difference")} value={formatEgp(Math.abs(difference), locale)} />
        )}
      </div>
      {completion.discrepancyNote && (
        <p className="mt-3 text-label text-on-surface-variant bg-surface-container rounded-lg p-3">
          <span className="font-bold">{t(locale, "admin_final_price_note")}: </span>
          {completion.discrepancyNote}
        </p>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-baseline">
      <span className="text-label text-outline">{label}</span>
      <span className="font-medium text-label text-on-surface [font-variant-numeric:tabular-nums]">{value}</span>
    </div>
  );
}
