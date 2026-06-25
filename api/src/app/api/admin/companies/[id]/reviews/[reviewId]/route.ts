import { NextResponse, type NextRequest } from "next/server";
import { adminOnly } from "@/lib/middleware/guards";
import * as reviewsService from "@/lib/services/reviews.service";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; reviewId: string }> };

// DELETE /api/admin/companies/[id]/reviews/[reviewId] → 204 (recomputes aggregate)
export const DELETE = adminOnly(async (_request: NextRequest, ctx: Ctx) => {
  const { id, reviewId } = await ctx.params;
  await reviewsService.remove(id, reviewId);
  return new NextResponse(null, { status: 204 });
});
