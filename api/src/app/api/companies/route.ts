import type { NextRequest } from "next/server";
import { withErrors } from "@/lib/utils/withErrors";
import { ok } from "@/lib/utils/response";
import { parseCompanyListQuery } from "@/lib/utils/query";
import * as companiesService from "@/lib/services/companies.service";

export const dynamic = "force-dynamic";

// GET /api/companies → ApiPage<ApiCompany> (ACTIVE only; page/pageSize/category/search/minRating/sort)
export const GET = withErrors(async (request: NextRequest) => {
  const query = parseCompanyListQuery(request.nextUrl.searchParams);
  const result = await companiesService.listActive(query);
  return ok(result);
});
