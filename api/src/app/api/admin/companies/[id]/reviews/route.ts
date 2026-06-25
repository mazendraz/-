import type { NextRequest } from "next/server";
import { ok } from "@/lib/utils/response";
import { adminOnly } from "@/lib/middleware/guards";
import { createReviewSchema } from "@/lib/validation/reviews";
import * as reviewsService from "@/lib/services/reviews.service";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/admin/companies/[id]/reviews → add a review (recomputes aggregate)
export const POST = adminOnly(async (request: NextRequest, ctx: Ctx) => {
  const { id } = await ctx.params;
  const input = createReviewSchema.parse(await request.json());
  return ok(await reviewsService.add(id, input), 201);
});
