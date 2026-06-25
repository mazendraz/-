import type { NextRequest } from "next/server";
import { ok } from "@/lib/utils/response";
import { adminOnly } from "@/lib/middleware/guards";
import { parseAdminLeadListQuery } from "@/lib/utils/query";
import * as leadsService from "@/lib/services/leads.service";

export const dynamic = "force-dynamic";

// GET /api/admin/leads → ApiPage<ApiLead> (filter by company / status / date range)
export const GET = adminOnly(async (request: NextRequest) => {
  const query = parseAdminLeadListQuery(request.nextUrl.searchParams);
  return ok(await leadsService.listAll(query));
});
