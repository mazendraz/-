import { NextResponse, type NextRequest } from "next/server";
import { ok } from "@/lib/utils/response";
import { adminOnly } from "@/lib/middleware/guards";
import { updateUserSchema } from "@/lib/validation/users";
import * as usersService from "@/lib/services/users.service";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// PATCH /api/admin/users/[id] → partial update (rename, reset password, relink
// company, change role/active). Guards the last active admin.
export const PATCH = adminOnly(async (request: NextRequest, ctx: Ctx) => {
  const { id } = await ctx.params;
  const input = updateUserSchema.parse(await request.json());
  return ok(await usersService.update(id, input));
});

// DELETE /api/admin/users/[id] → 204. Guards the last active admin.
export const DELETE = adminOnly(async (_request: NextRequest, ctx: Ctx) => {
  const { id } = await ctx.params;
  await usersService.remove(id);
  return new NextResponse(null, { status: 204 });
});
