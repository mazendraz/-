import { OperationsScreen } from "./OperationsScreen";

/** Full, unfiltered request roster — the Operations screen with no default
 *  status filter (the user picks one from the same table's filter bar). */
export function RequestsPage() {
  return (
    <OperationsScreen
      title="Requests"
      description="Every service request across Al Asima — search, filter and drill in."
      highlightKpi={["pendingRequests"]}
    />
  );
}
