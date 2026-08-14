// "Pending Actions" = requests nobody has responded to yet (Lead.status ===
// New) — the subset most in need of a human doing something next. The Active
// Services / Contacted split is one dropdown away in the same table if a
// wider view is wanted; this default matches the mockup's "requires
// attention" framing without inventing a status the backend doesn't have.
import { OperationsScreen } from "./OperationsScreen";

export function PendingActionsPage() {
  return (
    <OperationsScreen
      title="Pending Actions"
      description="New requests that haven't been contacted yet, and follow-ups running late."
      defaultStatus="New"
      highlightKpi={["pendingRequests", "overdueFollowUps"]}
    />
  );
}
