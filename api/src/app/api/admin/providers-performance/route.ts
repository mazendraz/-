import type { NextRequest } from "next/server";
import { page } from "@/lib/utils/response";
import { desktopOnly } from "@/lib/middleware/guards";
import { parseProviderPerformanceQuery } from "@/lib/utils/query";
import { providerPerformance } from "@/lib/services/providerPerformance.service";

export const dynamic = "force-dynamic";

// GET /api/admin/providers-performance → ApiPage<ApiProviderPerformance>. The
// Provider Performance directory (requests/completion rate/service value/
// discrepancy rate per provider). Zero new schema.
export const GET = desktopOnly("business:read", async (request: NextRequest) => {
  const query = parseProviderPerformanceQuery(request.nextUrl.searchParams);
  const result = await providerPerformance(query);
  return page(result.data, result.meta);
});
