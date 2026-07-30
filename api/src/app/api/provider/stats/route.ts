import type { NextRequest } from "next/server";
import { ok } from "@/lib/utils/response";
import { providerOnly } from "@/lib/middleware/guards";
import { ValidationError } from "@/lib/utils/errors";
import { parseStatsQuery } from "@/lib/utils/query";
import * as stats from "@/lib/services/stats.service";

export const dynamic = "force-dynamic";

// GET /api/provider/stats → ApiLeadStats scoped to the caller's own company.
//
// Scoped server-side from the session, never from a query param — a provider must
// not be able to read another company's numbers by changing a URL. `byCompany` is
// empty here for the same reason.
export const GET = providerOnly(async (request: NextRequest, _ctx, user) => {
  if (!user.companyId) throw new ValidationError("Your account isn't linked to a company yet.");
  const query = parseStatsQuery(request.nextUrl.searchParams);
  return ok(await stats.forCompany(user.companyId, query), 200, { "Cache-Control": "no-store" });
});
