import { t, type Locale, type StringKey } from "../lib/i18n";
import type { VerificationStatus } from "../lib/requests";

// Same neutral-by-design palette as FinalPriceSummary (admin/provider detail
// view) — a discrepancy is a difference to review, styled with the existing
// `warning` token, never `error`/red.
const STYLE: Record<VerificationStatus, string> = {
  PENDING: "bg-surface-container text-outline",
  CONFIRMED: "bg-success-container text-on-success-container",
  DISCREPANCY: "bg-warning-container text-on-warning-container",
};

const LABEL_KEY: Record<VerificationStatus, StringKey> = {
  PENDING: "completion_status_pending",
  CONFIRMED: "completion_status_confirmed",
  DISCREPANCY: "completion_status_discrepancy",
};

/**
 * Secondary status pill for a lead row/card once the provider has submitted a
 * completion — without this, a lead sits at the base "Completed" status pill
 * whether or not the client has actually verified the amount yet, which reads
 * as fully done even while a discrepancy is sitting unresolved.
 */
export default function VerificationBadge({ status, locale }: { status: VerificationStatus; locale: Locale }) {
  return (
    <span className={`text-caption px-2 py-0.5 rounded-full ${STYLE[status]}`}>
      {t(locale, LABEL_KEY[status])}
    </span>
  );
}
