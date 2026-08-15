import { ok } from "@/lib/utils/response";
import { desktopOnly } from "@/lib/middleware/guards";
import { providerPerformanceSummary } from "@/lib/services/providerPerformance.service";

export const dynamic = "force-dynamic";

// GET /api/admin/providers-performance/summary → ApiProviderPerformanceSummary.
// The Provider Performance screen's top KPI row — also read by the Analytics
// module's Provider Analytics screen, so "analytics:read" is an equally
// valid grant here (see withPermission.ts's ANY-of comment).
export const GET = desktopOnly(["business:read", "analytics:read"], async () => {
  return ok(await providerPerformanceSummary());
});
