import { t, type Locale } from "../../lib/i18n";
import { formatDate } from "../../lib/format";
import type { Lead } from "../../lib/requests";

/**
 * SERVICE / PROVIDER / ORDER ID / COMPLETED grid — mockup's cReview state header
 * (only shown there, not on the confirmed/discrepancy/rating states). Missed in
 * the first pass; added on re-audit against the mockup.
 */
export default function OrderContextGrid({ lead, locale }: { lead: Lead; locale: Locale }) {
  const fields: [string, string, boolean?][] = [
    [t(locale, "admin_lead_service"), lead.service],
    [t(locale, "verify_context_provider"), lead.companyName],
    [t(locale, "admin_lead_ref"), lead.refNumber, true],
    [t(locale, "verify_context_completed"), lead.completion ? formatDate(lead.completion.submittedAt, locale) : "—"],
  ];
  return (
    <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-2xl p-5 grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
      {fields.map(([label, value, mono]) => (
        <div key={label}>
          <div className="text-caption font-bold tracking-wide text-outline mb-1.5 uppercase">{label}</div>
          <div className={`text-label font-medium text-on-surface ${mono ? "font-mono" : ""}`}>{value}</div>
        </div>
      ))}
    </div>
  );
}
