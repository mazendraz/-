// Same Operations table, opened pre-filtered to LeadCompletion.verificationStatus
// === PENDING — completed jobs where the provider reported a final amount and
// the client hasn't confirmed or disputed it yet. Neutral language throughout
// (see OperationsScreen's VerificationIcon/finalPriceLabel) — this is a
// review queue, never an automatic fraud accusation.
import { OperationsScreen } from "./OperationsScreen";

export function PriceVerificationPage() {
  return (
    <OperationsScreen
      title="Price Verification"
      description="Completed jobs awaiting the client's confirmation of the final amount."
      defaultVerificationStatus="PENDING"
      highlightKpi={["awaitingVerification"]}
    />
  );
}
