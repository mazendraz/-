import type { NextRequest } from "next/server";
import { ok } from "@/lib/utils/response";
import { providerOnly } from "@/lib/middleware/guards";
import { ValidationError } from "@/lib/utils/errors";
import * as changeRequests from "@/lib/services/changeRequests.service";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// DELETE /api/provider/change-requests/:id → provider withdraws their own request.
export const DELETE = providerOnly(async (_request: NextRequest, ctx: Ctx, user) => {
  if (!user.companyId) throw new ValidationError("Your account isn't linked to a company yet.");
  const { id } = await ctx.params;
  // cancel() scopes by companyId, so one provider cannot withdraw another's
  // request — a wrong id reads as "not found", not "forbidden", so the endpoint
  // never confirms that someone else's request exists.
  return ok(await changeRequests.cancel(user.companyId, id));
});
