import type { NextRequest } from "next/server";
import { withErrors } from "@/lib/utils/withErrors";
import { ok } from "@/lib/utils/response";
import { parseCompanyListQuery } from "@/lib/utils/query";
import * as companiesService from "@/lib/services/companies.service";

export const dynamic = "force-dynamic";

// GET /api/categories/[slug]/companies → ApiPage<ApiCompany> (ACTIVE only, in category)
export const GET = withErrors(
  async (request: NextRequest, ctx: { params: Promise<{ slug: string }> }) => {
    const { slug } = await ctx.params;
    const query = parseCompanyListQuery(request.nextUrl.searchParams);
    const result = await companiesService.listByCategory(slug, query);
    return ok(result);
  },
);
