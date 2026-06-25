import type { NextRequest } from "next/server";
import { ok } from "@/lib/utils/response";
import { providerOnly } from "@/lib/middleware/guards";
import { parseLeadListQuery } from "@/lib/utils/query";
import * as leadsService from "@/lib/services/leads.service";

export const dynamic = "force-dynamic";

// GET /api/provider/leads → ApiPage<ApiLead> for the provider's own company only.
export const GET = providerOnly(async (request: NextRequest, _ctx, user) => {
  const query = parseLeadListQuery(request.nextUrl.searchParams);

  // A provider not linked to a company has no leads.
  if (!user.companyId) {
    return ok({
      data: [],
      meta: { total: 0, page: query.page ?? 1, pageSize: query.pageSize ?? 20 },
    });
  }

  return ok(await leadsService.listByCompany(user.companyId, query));
});
