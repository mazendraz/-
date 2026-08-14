import { ok } from "@/lib/utils/response";
import { desktopOnly } from "@/lib/middleware/guards";
import { providerPerformanceSummary } from "@/lib/services/providerPerformance.service";

export const dynamic = "force-dynamic";

// GET /api/admin/providers-performance/summary → ApiProviderPerformanceSummary.
// The Provider Performance screen's top KPI row.
export const GET = desktopOnly("business:read", async () => {
  return ok(await providerPerformanceSummary());
});
