import type { NextRequest } from "next/server";
import { ok } from "@/lib/utils/response";
import { adminOnly } from "@/lib/middleware/guards";
import * as service from "@/lib/services/siteReviews.service";

export const dynamic = "force-dynamic";

function toInt(v: string | null): number | undefined {
  if (v == null) return undefined;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : undefined;
}

// GET /api/admin/site-reviews → all ApiSiteReview[] (visible + hidden, for moderation).
//   Backward-compatible: with no `page`/`pageSize` it returns the full array as
//   before. Optional `search` filters in the DB; pass `page`/`pageSize` to get a
//   bounded ApiPage<ApiSiteReview> instead (scale-safe for large datasets).
export const GET = adminOnly(async (request: NextRequest) => {
  const sp = request.nextUrl.searchParams;
  const search = sp.get("search")?.trim() || undefined;
  const page = toInt(sp.get("page"));
  const pageSize = toInt(sp.get("pageSize"));
  if (page !== undefined || pageSize !== undefined) {
    return ok(await service.listPage({ search, page, pageSize }));
  }
  return ok(await service.listAll({ search }));
});
