// Same Operations table, opened pre-filtered to LeadCompletion.verificationStatus
// === DISCREPANCY — the client reported a different final amount than the
// provider did. "Discrepancy / Needs Review", never "fraud" — see
// leadCompletion.service.ts's verificationPushTitle for the same product
// requirement enforced on the notification copy.
import { OperationsScreen } from "./OperationsScreen";

export function PriceDiscrepanciesPage() {
  return (
    <OperationsScreen
      title="Price Discrepancies"
      description="Jobs where the client reported a different final amount than the provider — needs review, not an accusation."
      defaultVerificationStatus="DISCREPANCY"
      highlightKpi={["discrepancies"]}
    />
  );
}
