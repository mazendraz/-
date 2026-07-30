import type { NextRequest } from "next/server";
import { ok } from "@/lib/utils/response";
import { adminOnly } from "@/lib/middleware/guards";
import { busyWindowSchema } from "@/lib/validation/busyWindows";
import * as busyWindows from "@/lib/services/busyWindows.service";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/admin/companies/:id/busy-windows
export const GET = adminOnly(async (_req: NextRequest, ctx: Ctx) => {
  const { id } = await ctx.params;
  return ok(await busyWindows.listForCompany(id));
});

// POST — created with createdByAdmin = true, which the provider cannot edit or
// remove from their own dashboard.
export const POST = adminOnly(async (request: NextRequest, ctx: Ctx, user) => {
  const { id } = await ctx.params;
  const input = busyWindowSchema.parse(await request.json());
  return ok(await busyWindows.create(user, id, input, true), 201);
});
