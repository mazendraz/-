import type { NextRequest } from "next/server";
import { ok } from "@/lib/utils/response";
import { adminOnly } from "@/lib/middleware/guards";
import { parseStatsQuery } from "@/lib/utils/query";
import * as stats from "@/lib/services/stats.service";

export const dynamic = "force-dynamic";

// GET /api/admin/stats → ApiLeadStats across every company.
//
// Its own endpoint rather than extra fields on /admin/leads: the lead list is
// paginated and these are whole-table aggregates. Deriving them from a page is
// exactly the bug this replaces.
export const GET = adminOnly(async (request: NextRequest) => {
  const query = parseStatsQuery(request.nextUrl.searchParams);
  return ok(await stats.forAllCompanies(query), 200, { "Cache-Control": "no-store" });
});
