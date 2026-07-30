import type { NextRequest } from "next/server";
import { ok } from "@/lib/utils/response";
import { adminOnly } from "@/lib/middleware/guards";
import { parseAdminWaitlistListQuery } from "@/lib/utils/query";
import * as waitlistService from "@/lib/services/waitlist.service";

export const dynamic = "force-dynamic";

// GET /api/admin/waitlist → ApiPage<ApiWaitlistEntry> across EVERY company
// (filter by company / status / search) — backs the admin Leads tab's merged view.
export const GET = adminOnly(async (request: NextRequest) => {
  const query = parseAdminWaitlistListQuery(request.nextUrl.searchParams);
  return ok(await waitlistService.listAll(query));
});
