import { NextResponse, type NextRequest } from "next/server";
import { ok } from "@/lib/utils/response";
import { adminOnly } from "@/lib/middleware/guards";
import { reviewApprovalSchema } from "@/lib/validation/reviews";
import * as reviewsService from "@/lib/services/reviews.service";
import * as audit from "@/lib/services/audit.service";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// PATCH /api/admin/reviews/[id] → approve / un-approve (recomputes the aggregate).
export const PATCH = adminOnly(async (request: NextRequest, ctx: Ctx, user) => {
  const { id } = await ctx.params;
  const { approved } = reviewApprovalSchema.parse(await request.json());
  const review = await reviewsService.setApproved(id, approved);
  await audit.record(user, { action: approved ? "review.approve" : "review.unapprove", entity: "Review", entityId: id });
  return ok(review);
});

// DELETE /api/admin/reviews/[id] → delete any review (recomputes the aggregate).
export const DELETE = adminOnly(async (_request: NextRequest, ctx: Ctx, user) => {
  const { id } = await ctx.params;
  await reviewsService.removeById(id);
  await audit.record(user, { action: "review.delete", entity: "Review", entityId: id });
  return new NextResponse(null, { status: 204 });
});
