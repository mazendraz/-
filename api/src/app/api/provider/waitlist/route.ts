import type { NextRequest } from "next/server";
import { ok } from "@/lib/utils/response";
import { providerOnly } from "@/lib/middleware/guards";
import { parseWaitlistListQuery } from "@/lib/utils/query";
import * as waitlistService from "@/lib/services/waitlist.service";

export const dynamic = "force-dynamic";

// GET /api/provider/waitlist → ApiPage<ApiWaitlistEntry> for the provider's own company.
export const GET = providerOnly(async (request: NextRequest, _ctx, user) => {
  const query = parseWaitlistListQuery(request.nextUrl.searchParams);
  if (!user.companyId) {
    return ok({ data: [], meta: { total: 0, page: query.page ?? 1, pageSize: query.pageSize ?? 20 } });
  }
  return ok(await waitlistService.listByCompany(user.companyId, query));
});
