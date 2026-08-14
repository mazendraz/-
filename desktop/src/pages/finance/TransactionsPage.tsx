import { FinanceLedgerScreen } from "./FinanceLedgerScreen";

export function TransactionsPage() {
  return (
    <FinanceLedgerScreen
      title="Transactions"
      description="The full financial ledger — commission income, expenses and adjustments."
      emptyIcon="receipt_long"
    />
  );
}
