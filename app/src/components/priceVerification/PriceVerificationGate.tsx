import { useState } from "react";
import { useLocale } from "../../context/LocaleContext";
import { t } from "../../lib/i18n";
import { verifyLeadAmount, type Lead } from "../../lib/requests";
import { ApiError } from "../../lib/api";
import OrderContextGrid from "./OrderContextGrid";
import ProviderAmountCard from "./ProviderAmountCard";
import DiscrepancyForm from "./DiscrepancyForm";
import ConfirmationState from "./ConfirmationState";
import ReviewStep from "./ReviewStep";

type Phase = "amount" | "discrepancy" | "confirmed" | "rating";

/**
 * Mandatory, non-dismissible "verify the final amount" screen — a client with a
 * PENDING completion sees ONLY this, on every route, until they resolve it (see
 * RootLayout.tsx, which renders this in place of the whole public site, the
 * same way it already does for the maintenance/offline screens).
 *
 * No close/skip/dismiss control exists on the amount or discrepancy phases —
 * that is deliberate, not an oversight. Only the review phase (after
 * verification is already resolved) has a "Skip for now".
 */
export default function PriceVerificationGate({
  lead, onResolved,
}: {
  lead: Lead;
  /** Called once the (optional) review phase is done or skipped — RootLayout
   *  uses this to stop latching onto this lead and resume normal routing. */
  onResolved: () => void;
}) {
  const { locale } = useLocale();
  // completion is guaranteed present: RootLayout only ever mounts this
  // component for a lead whose completion.verificationStatus is PENDING.
  const completion = lead.completion!;
  const [phase, setPhase] = useState<Phase>("amount");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  async function handleConfirm() {
    setBusy(true);
    setError(undefined);
    try {
      await verifyLeadAmount({ ref: lead.refNumber, token: lead.trackingToken, phone: lead.phone, decision: "confirmed" });
      setPhase("confirmed");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t(locale, "verify_error_generic"));
    } finally {
      setBusy(false);
    }
  }

  async function handleDiscrepancy(clientAmount: number, note: string) {
    setBusy(true);
    setError(undefined);
    try {
      await verifyLeadAmount({
        ref: lead.refNumber, token: lead.trackingToken, phone: lead.phone,
        decision: "discrepancy", clientAmount, note: note || undefined,
      });
      setPhase("confirmed");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t(locale, "verify_error_generic"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-xl">
        {phase === "amount" && (
          <>
            <h1 className="text-center font-black text-headline sm:text-display text-on-surface tracking-tight mb-2">{t(locale, "verify_title")}</h1>
            <p className="text-center text-body text-outline max-w-md mx-auto mb-6">{t(locale, "verify_sub")}</p>
            <OrderContextGrid lead={lead} locale={locale} />
            <ProviderAmountCard
              completion={completion} busy={busy} error={error} locale={locale}
              onConfirm={handleConfirm} onDispute={() => setPhase("discrepancy")}
            />
          </>
        )}
        {phase === "discrepancy" && (
          <DiscrepancyForm
            completion={completion} busy={busy} error={error} locale={locale}
            onSubmit={handleDiscrepancy} onBack={() => setPhase("amount")}
          />
        )}
        {phase === "confirmed" && (
          <ConfirmationState lead={lead} completion={completion} locale={locale} onContinue={() => setPhase("rating")} />
        )}
        {phase === "rating" && (
          <ReviewStep lead={lead} locale={locale} onDone={onResolved} />
        )}
      </div>
    </div>
  );
}
