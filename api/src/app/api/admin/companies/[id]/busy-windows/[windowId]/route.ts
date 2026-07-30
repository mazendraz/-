import type { NextRequest } from "next/server";
import { ok } from "@/lib/utils/response";
import { adminOnly } from "@/lib/middleware/guards";
import { busyWindowSchema } from "@/lib/validation/busyWindows";
import * as busyWindows from "@/lib/services/busyWindows.service";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; windowId: string }> };

// An admin can edit or remove ANY window, including ones the provider created —
// the createdByAdmin guard only restricts the provider side.
export const PATCH = adminOnly(async (request: NextRequest, ctx: Ctx, user) => {
  const { id, windowId } = await ctx.params;
  const input = busyWindowSchema.parse(await request.json());
  return ok(await busyWindows.update(user, id, windowId, input, true));
});

export const DELETE = adminOnly(async (_req: NextRequest, ctx: Ctx, user) => {
  const { id, windowId } = await ctx.params;
  await busyWindows.remove(user, id, windowId, true);
  return ok({ ok: true });
});
