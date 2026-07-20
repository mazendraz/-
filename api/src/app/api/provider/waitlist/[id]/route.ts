import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { ok } from "@/lib/utils/response";
import { providerOnly } from "@/lib/middleware/guards";
import { ValidationError } from "@/lib/utils/errors";
import { waitlistStatusSchema } from "@/lib/validation/availability";
import * as waitlistService from "@/lib/services/waitlist.service";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// PATCH /api/provider/waitlist/[id] → move an entry through the waitlist lifecycle.
export const PATCH = providerOnly(async (request: NextRequest, ctx: Ctx, user) => {
  if (!user.companyId) throw new ValidationError("Your account isn't linked to a company yet.");
  const { id } = await ctx.params;
  const { status } = waitlistStatusSchema.parse(await request.json());
  return ok(await waitlistService.setStatus(user.companyId, id, status));
});

// DELETE /api/provider/waitlist/[id] → remove an entry from the waiting list.
export const DELETE = providerOnly(async (_request: NextRequest, ctx: Ctx, user) => {
  if (!user.companyId) throw new ValidationError("Your account isn't linked to a company yet.");
  const { id } = await ctx.params;
  await waitlistService.remove(user.companyId, id);
  return new NextResponse(null, { status: 204 });
});
