import type { NextRequest } from "next/server";
import { withErrors } from "@/lib/utils/withErrors";
import { ok } from "@/lib/utils/response";
import * as companiesService from "@/lib/services/companies.service";

export const dynamic = "force-dynamic";

// GET /api/companies/[slug] → RAW ApiCompany (full profile). 404 if not ACTIVE.
export const GET = withErrors(
  async (_request: NextRequest, ctx: { params: Promise<{ slug: string }> }) => {
    const { slug } = await ctx.params;
    const company = await companiesService.getActiveBySlug(slug);
    return ok(company);
  },
);
