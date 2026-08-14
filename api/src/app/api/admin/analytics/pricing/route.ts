import type { NextRequest } from "next/server";
import { ok } from "@/lib/utils/response";
import { desktopOnly } from "@/lib/middleware/guards";
import { parsePricingAnalyticsQuery } from "@/lib/utils/query";
import { pricingAnalytics } from "@/lib/services/pricingIntelligence.service";

export const dynamic = "force-dynamic";

// GET /api/admin/analytics/pricing → ApiPricingAnalytics. The Analytics
// module's Pricing Analytics screen: KPI row + weekly trend + by-category /
// by-provider breakdowns. See pricingIntelligence.service.ts's doc comment
// for why this is a separate function from pricingIntelligence() rather than
// an extension of it.
export const GET = desktopOnly("analytics:read", async (request: NextRequest) => {
  const query = parsePricingAnalyticsQuery(request.nextUrl.searchParams);
  return ok(await pricingAnalytics(query), 200, { "Cache-Control": "no-store" });
});
