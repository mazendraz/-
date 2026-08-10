import type { NextRequest } from "next/server";
import { ok } from "@/lib/utils/response";
import { adminOnly } from "@/lib/middleware/guards";
import * as reviewsService from "@/lib/services/reviews.service";

export const dynamic = "force-dynamic";

// GET /api/admin/reviews?status=pending|approved&page=&pageSize=
//   → ApiPage<AdminReviewItem>. Omit status for all; the moderation queue
//     defaults to pending. Paged so the queue can report the real backlog
//     instead of silently stopping at a hidden ceiling.
export const GET = adminOnly(async (request: NextRequest) => {
  const sp = request.nextUrl.searchParams;
  const status = sp.get("status");
  const approved = status === "approved" ? true : status === "pending" ? false : undefined;
  const toInt = (v: string | null): number | undefined => {
    if (v == null) return undefined;
    const n = Number.parseInt(v, 10);
    return Number.isFinite(n) ? n : undefined;
  };
  return ok(
    await reviewsService.listAllForAdmin({
      approved,
      page: toInt(sp.get("page")),
      pageSize: toInt(sp.get("pageSize")),
    }),
  );
});
