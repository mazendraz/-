import type { NextRequest } from "next/server";
import { ok } from "@/lib/utils/response";
import { desktopOnly } from "@/lib/middleware/guards";
import { parseAdminLeadListQuery } from "@/lib/utils/query";
import * as leadsService from "@/lib/services/leads.service";

export const dynamic = "force-dynamic";

// GET /api/admin/desktop/leads → ApiPage<ApiLead>. Business Control Center's
// Operations screen — Requests / Active Work / Pending Actions are one table
// with different default status filters (see desktop/src/pages/operations),
// per "use the existing Lead architecture, don't build a second Request
// system". Reuses leadsService.listAll — the exact function the (adminOnly,
// role-only) /api/admin/leads route already uses for the web Admin
// Dashboard. This is a SEPARATE route, not a change to that one: a desktop
// user without "operations:read" granted still can't reach lead data this
// way, and the web Admin Dashboard's own endpoint is untouched.
export const GET = desktopOnly("operations:read", async (request: NextRequest) => {
  const query = parseAdminLeadListQuery(request.nextUrl.searchParams);
  return ok(await leadsService.listAll(query));
});
