import type { NextRequest } from "next/server";
import { ok } from "@/lib/utils/response";
import { providerOnly } from "@/lib/middleware/guards";
import { ValidationError } from "@/lib/utils/errors";
import { tierSchema } from "@/lib/validation/offerings";
import * as offerings from "@/lib/services/offerings.service";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/provider/offerings/:id/tiers → add a quantity band ("2–3 rooms").
//
// The service rejects overlapping ranges: if two tiers both match a 3-room job
// the applicable price is ambiguous, and customer and provider will each read it
// the way that suits them.
//
// A band on a PUBLISHED offering is a new public price, so it is written as a
// draft and a publish request is filed — `path` in the response tells the editor
// which happened. Only a band on a draft offering goes straight through.
export const POST = providerOnly(async (request: NextRequest, ctx: Ctx, user) => {
  if (!user.companyId) throw new ValidationError("Your account isn't linked to a company yet.");
  const { id } = await ctx.params;
  const input = tierSchema.parse(await request.json());
  return ok(await offerings.addTier(user, user.companyId, id, input), 201);
});
