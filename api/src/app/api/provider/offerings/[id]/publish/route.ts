import type { NextRequest } from "next/server";
import { ok } from "@/lib/utils/response";
import { providerOnly } from "@/lib/middleware/guards";
import { ValidationError } from "@/lib/utils/errors";
import * as offerings from "@/lib/services/offerings.service";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/provider/offerings/:id/publish → files a ChangeRequest{PUBLISH}.
//
// From this moment the draft is LOCKED against edits until it is reviewed or the
// request is withdrawn. Without that lock the provider could rewrite the content
// after the admin read it and before it went live, and the approval would apply
// to something nobody reviewed.
export const POST = providerOnly(async (_req: NextRequest, ctx: Ctx, user) => {
  if (!user.companyId) throw new ValidationError("Your account isn't linked to a company yet.");
  const { id } = await ctx.params;
  return ok(await offerings.requestPublish(user, user.companyId, id), 201);
});
