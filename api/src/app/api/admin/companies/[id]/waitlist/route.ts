import type { NextRequest } from "next/server";
import { ok } from "@/lib/utils/response";
import { adminOnly } from "@/lib/middleware/guards";
import { parseWaitlistListQuery } from "@/lib/utils/query";
import * as waitlistService from "@/lib/services/waitlist.service";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/admin/companies/[id]/waitlist → ApiPage<ApiWaitlistEntry> for one company.
export const GET = adminOnly(async (request: NextRequest, ctx: Ctx) => {
  const { id } = await ctx.params;
  const query = parseWaitlistListQuery(request.nextUrl.searchParams);
  return ok(await waitlistService.listByCompany(id, query));
});
