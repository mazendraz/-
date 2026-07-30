import type { NextRequest } from "next/server";
import { ok } from "@/lib/utils/response";
import { providerOnly } from "@/lib/middleware/guards";
import { ValidationError } from "@/lib/utils/errors";
import { visibilitySchema } from "@/lib/validation/offerings";
import * as offerings from "@/lib/services/offerings.service";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// PATCH /api/provider/offerings/:id/visibility → isActive / sortOrder, applied
// IMMEDIATELY, even on a published offering.
//
// This is the deliberate exception to "everything waits for approval". A
// provider who spots a wrong price going out to customers has to be able to pull
// it NOW; making them wait two days causes more damage than the review prevents.
// It is safe because neither field touches content or price: hiding changes
// nothing, and un-hiding restores exactly the same approved content. Both are
// written to the audit log so repeated hide/unhide cycles are visible.
export const PATCH = providerOnly(async (request: NextRequest, ctx: Ctx, user) => {
  if (!user.companyId) throw new ValidationError("Your account isn't linked to a company yet.");
  const { id } = await ctx.params;
  const patch = visibilitySchema.parse(await request.json());
  return ok(await offerings.setVisibility(user, user.companyId, id, patch));
});
