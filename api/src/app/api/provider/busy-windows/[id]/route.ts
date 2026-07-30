import type { NextRequest } from "next/server";
import { ok } from "@/lib/utils/response";
import { providerOnly } from "@/lib/middleware/guards";
import { ValidationError } from "@/lib/utils/errors";
import { busyWindowSchema } from "@/lib/validation/busyWindows";
import * as busyWindows from "@/lib/services/busyWindows.service";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

function companyOf(user: { companyId: string | null }): string {
  if (!user.companyId) throw new ValidationError("Your account isn't linked to a company yet.");
  return user.companyId;
}

// PATCH /api/provider/busy-windows/:id
// 403 when the period was created by an admin — otherwise a company could undo
// an admin marking it unavailable.
export const PATCH = providerOnly(async (request: NextRequest, ctx: Ctx, user) => {
  const { id } = await ctx.params;
  const input = busyWindowSchema.parse(await request.json());
  return ok(await busyWindows.update(user, companyOf(user), id, input, false));
});

// DELETE /api/provider/busy-windows/:id — same admin-created guard.
export const DELETE = providerOnly(async (_req: NextRequest, ctx: Ctx, user) => {
  const { id } = await ctx.params;
  await busyWindows.remove(user, companyOf(user), id, false);
  return ok({ ok: true });
});
