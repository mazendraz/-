import type { NextRequest } from "next/server";
import { ok } from "@/lib/utils/response";
import { adminOnly } from "@/lib/middleware/guards";
import * as reviewsService from "@/lib/services/reviews.service";

export const dynamic = "force-dynamic";

// GET /api/admin/reviews?status=pending|approved → verified customer reviews.
// Omit status for all; the moderation queue defaults to pending.
export const GET = adminOnly(async (request: NextRequest) => {
  const status = request.nextUrl.searchParams.get("status");
  const approved = status === "approved" ? true : status === "pending" ? false : undefined;
  return ok(await reviewsService.listAllForAdmin(approved));
});
