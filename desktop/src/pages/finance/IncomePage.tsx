import { FinanceLedgerScreen } from "./FinanceLedgerScreen";

export function IncomePage() {
  return (
    <FinanceLedgerScreen
      title="Income"
      description="Commission recognized on completed, verified jobs."
      lockType="COMMISSION_INCOME"
      emptyIcon="trending_up"
    />
  );
}
