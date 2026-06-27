import { NextResponse, type NextRequest } from "next/server";
import { ok } from "@/lib/utils/response";
import { adminOnly } from "@/lib/middleware/guards";
import { updateCategorySchema } from "@/lib/validation/categories";
import * as categoriesService from "@/lib/services/categories.service";
import * as audit from "@/lib/services/audit.service";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// PUT /api/admin/categories/[id] → update
export const PUT = adminOnly(async (request: NextRequest, ctx: Ctx) => {
  const { id } = await ctx.params;
  const input = updateCategorySchema.parse(await request.json());
  return ok(await categoriesService.update(id, input));
});

// DELETE /api/admin/categories/[id] → 204. CONFLICT if it still has companies,
// unless ?cascade=true, which also deletes every company in the category.
export const DELETE = adminOnly(async (request: NextRequest, ctx: Ctx, user) => {
  const { id } = await ctx.params;
  const cascade = request.nextUrl.searchParams.get("cascade") === "true";
  await categoriesService.remove(id, cascade);
  await audit.record(user, {
    action: cascade ? "category.delete_cascade" : "category.delete",
    entity: "Category",
    entityId: id,
  });
  return new NextResponse(null, { status: 204 });
});
