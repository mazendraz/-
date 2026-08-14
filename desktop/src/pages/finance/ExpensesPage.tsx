import { FinanceLedgerScreen } from "./FinanceLedgerScreen";

export function ExpensesPage() {
  return (
    <FinanceLedgerScreen
      title="Expenses"
      description="Operating costs recorded manually by the finance team."
      lockType="EXPENSE"
      allowCreate
      emptyIcon="trending_down"
    />
  );
}
