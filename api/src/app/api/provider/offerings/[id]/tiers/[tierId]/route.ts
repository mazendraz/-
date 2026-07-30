import type { NextRequest } from "next/server";
import { ok } from "@/lib/utils/response";
import { providerOnly } from "@/lib/middleware/guards";
import { ValidationError } from "@/lib/utils/errors";
import * as offerings from "@/lib/services/offerings.service";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; tierId: string }> };

// DELETE /api/provider/offerings/:id/tiers/:tierId
//
// A draft band is removed outright; a PUBLISHED one files a delete request and
// stays quotable until an admin approves. `path` in the response says which.
export const DELETE = providerOnly(async (_req: NextRequest, ctx: Ctx, user) => {
  if (!user.companyId) throw new ValidationError("Your account isn't linked to a company yet.");
  const { id, tierId } = await ctx.params;
  return ok(await offerings.removeTier(user, user.companyId, id, tierId));
});
