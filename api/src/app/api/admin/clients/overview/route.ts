import type { NextRequest } from "next/server";
import { ok } from "@/lib/utils/response";
import { desktopOnly } from "@/lib/middleware/guards";
import { parseClientOverviewQuery } from "@/lib/utils/query";
import * as clientsService from "@/lib/services/clients.service";

export const dynamic = "force-dynamic";

// GET /api/admin/clients/overview → ApiClientOverview. The Clients & CRM
// screen's KPI row (Total Clients, Retention Rate, Avg Lifetime Value).
export const GET = desktopOnly("business:read", async (request: NextRequest) => {
  const query = parseClientOverviewQuery(request.nextUrl.searchParams);
  return ok(await clientsService.overview(query), 200, { "Cache-Control": "no-store" });
});
