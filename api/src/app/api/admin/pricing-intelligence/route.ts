import type { NextRequest } from "next/server";
import { ok } from "@/lib/utils/response";
import { desktopOnly } from "@/lib/middleware/guards";
import { parsePricingIntelligenceQuery } from "@/lib/utils/query";
import { pricingIntelligence } from "@/lib/services/pricingIntelligence.service";

export const dynamic = "force-dynamic";

// GET /api/admin/pricing-intelligence → ApiPricingIntelligence. Zero new
// schema — pure aggregation over Lead + LeadCompletion (see the service).
export const GET = desktopOnly("analytics:read", async (request: NextRequest) => {
  const query = parsePricingIntelligenceQuery(request.nextUrl.searchParams);
  return ok(await pricingIntelligence(query), 200, { "Cache-Control": "no-store" });
});
