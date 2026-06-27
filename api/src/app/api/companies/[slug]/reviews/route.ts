import type { NextRequest } from "next/server";
import { withErrors } from "@/lib/utils/withErrors";
import { ok } from "@/lib/utils/response";
import * as reviewsService from "@/lib/services/reviews.service";

export const dynamic = "force-dynamic";

// GET /api/companies/[slug]/reviews?search=&rating=&page=&pageSize=
//   → ApiPage<ApiReview> for one ACTIVE company. Paginated + searchable over the
//   COMPLETE review history (the profile payload only carries the 50 newest).
export const GET = withErrors(
  async (request: NextRequest, ctx: { params: Promise<{ slug: string }> }) => {
    const { slug } = await ctx.params;
    const sp = request.nextUrl.searchParams;
    const toInt = (v: string | null): number | undefined => {
      if (v == null) return undefined;
      const n = Number.parseInt(v, 10);
      return Number.isFinite(n) ? n : undefined;
    };
    const result = await reviewsService.listByCompanySlug(slug, {
      search: sp.get("search")?.trim() || undefined,
      rating: toInt(sp.get("rating")),
      page: toInt(sp.get("page")),
      pageSize: toInt(sp.get("pageSize")),
    });
    return ok(result);
  },
);
