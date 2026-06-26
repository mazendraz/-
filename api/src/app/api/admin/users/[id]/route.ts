import { NextResponse, type NextRequest } from "next/server";
import { ok } from "@/lib/utils/response";
import { adminOnly } from "@/lib/middleware/guards";
import { updateUserSchema } from "@/lib/validation/users";
import * as usersService from "@/lib/services/users.service";
import * as audit from "@/lib/services/audit.service";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// PATCH /api/admin/users/[id] → partial update (rename, reset password, relink
// company, change role/active). Guards the last active admin.
export const PATCH = adminOnly(async (request: NextRequest, ctx: Ctx, user) => {
  const { id } = await ctx.params;
  const input = updateUserSchema.parse(await request.json());
  const result = await usersService.update(id, input);
  // Record WHICH fields changed (never the password value); flag the sensitive ones.
  await audit.record(user, {
    action: "user.update",
    entity: "User",
    entityId: id,
    meta: {
      fields: Object.keys(input),
      ...(input.role !== undefined ? { role: input.role } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      passwordReset: input.password !== undefined,
    },
  });
  return ok(result);
});

// DELETE /api/admin/users/[id] → 204. Guards the last active admin.
export const DELETE = adminOnly(async (_request: NextRequest, ctx: Ctx, user) => {
  const { id } = await ctx.params;
  await usersService.remove(id);
  await audit.record(user, { action: "user.delete", entity: "User", entityId: id });
  return new NextResponse(null, { status: 204 });
});
