import type { NextRequest } from "next/server";
import { ok } from "@/lib/utils/response";
import { adminOnly } from "@/lib/middleware/guards";
import { visibilitySchema } from "@/lib/validation/offerings";
import * as offerings from "@/lib/services/offerings.service";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; offeringId: string }> };

// PATCH /api/admin/companies/:id/offerings/:offeringId/visibility → isActive /
// sortOrder, same immediate-no-review semantics as the provider's own version.
export const PATCH = adminOnly(async (request: NextRequest, ctx: Ctx, user) => {
  const { id, offeringId } = await ctx.params;
  const patch = visibilitySchema.parse(await request.json());
  return ok(await offerings.setVisibility(user, id, offeringId, patch));
});
