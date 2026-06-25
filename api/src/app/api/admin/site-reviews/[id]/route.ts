import { NextResponse, type NextRequest } from "next/server";
import { ok } from "@/lib/utils/response";
import { adminOnly } from "@/lib/middleware/guards";
import { siteReviewVisibilitySchema } from "@/lib/validation/siteReviews";
import * as service from "@/lib/services/siteReviews.service";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// PATCH /api/admin/site-reviews/[id] → toggle homepage visibility
export const PATCH = adminOnly(async (request: NextRequest, ctx: Ctx) => {
  const { id } = await ctx.params;
  const { visible } = siteReviewVisibilitySchema.parse(await request.json());
  return ok(await service.setVisible(id, visible));
});

// DELETE /api/admin/site-reviews/[id] → 204
export const DELETE = adminOnly(async (_request: NextRequest, ctx: Ctx) => {
  const { id } = await ctx.params;
  await service.remove(id);
  return new NextResponse(null, { status: 204 });
});
