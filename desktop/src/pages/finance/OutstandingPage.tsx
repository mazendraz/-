import { FinanceLedgerScreen } from "./FinanceLedgerScreen";

export function OutstandingPage() {
  return (
    <FinanceLedgerScreen
      title="Outstanding"
      description="Commission recognized but not yet collected — recognized: PENDING."
      lockType="COMMISSION_INCOME"
      lockStatus="PENDING"
      showAging
      emptyIcon="hourglass_top"
    />
  );
}
