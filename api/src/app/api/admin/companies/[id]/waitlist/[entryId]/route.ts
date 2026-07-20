import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { ok } from "@/lib/utils/response";
import { adminOnly } from "@/lib/middleware/guards";
import { waitlistStatusSchema } from "@/lib/validation/availability";
import * as waitlistService from "@/lib/services/waitlist.service";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; entryId: string }> };

// PATCH /api/admin/companies/[id]/waitlist/[entryId] → update an entry's status.
export const PATCH = adminOnly(async (request: NextRequest, ctx: Ctx) => {
  const { id, entryId } = await ctx.params;
  const { status } = waitlistStatusSchema.parse(await request.json());
  return ok(await waitlistService.setStatus(id, entryId, status));
});

// DELETE /api/admin/companies/[id]/waitlist/[entryId] → remove an entry.
export const DELETE = adminOnly(async (_request: NextRequest, ctx: Ctx) => {
  const { id, entryId } = await ctx.params;
  await waitlistService.remove(id, entryId);
  return new NextResponse(null, { status: 204 });
});
