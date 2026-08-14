import { ok } from "@/lib/utils/response";
import { desktopOnly } from "@/lib/middleware/guards";
import * as leadsService from "@/lib/services/leads.service";

export const dynamic = "force-dynamic";

// GET /api/admin/desktop/leads/summary → ApiOperationsSummary. The
// Operations screen's 5 KPI cards (Pending Requests / Active Services /
// Awaiting Verification / Discrepancies / Overdue Follow-ups).
export const GET = desktopOnly("operations:read", async () => {
  return ok(await leadsService.operationsSummary());
});
