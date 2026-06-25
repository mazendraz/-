import { NextResponse, type NextRequest } from "next/server";
import { ok } from "@/lib/utils/response";
import { adminOnly } from "@/lib/middleware/guards";
import { updateCategorySchema } from "@/lib/validation/categories";
import * as categoriesService from "@/lib/services/categories.service";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// PUT /api/admin/categories/[id] → update
export const PUT = adminOnly(async (request: NextRequest, ctx: Ctx) => {
  const { id } = await ctx.params;
  const input = updateCategorySchema.parse(await request.json());
  return ok(await categoriesService.update(id, input));
});

// DELETE /api/admin/categories/[id] → 204 (CONFLICT if it still has companies)
export const DELETE = adminOnly(async (_request: NextRequest, ctx: Ctx) => {
  const { id } = await ctx.params;
  await categoriesService.remove(id);
  return new NextResponse(null, { status: 204 });
});
