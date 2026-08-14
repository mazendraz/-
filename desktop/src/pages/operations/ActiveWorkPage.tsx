import { OperationsScreen } from "./OperationsScreen";

/** Same Operations table, opened pre-filtered to "In Progress" — the
 *  requests a provider is actively working right now. */
export function ActiveWorkPage() {
  return (
    <OperationsScreen
      title="Active Work"
      description="Requests currently in progress with a provider."
      defaultStatus="In Progress"
      highlightKpi={["activeServices"]}
    />
  );
}
