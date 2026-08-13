import type { NextRequest } from "next/server";
import { ok } from "@/lib/utils/response";
import { authed } from "@/lib/middleware/guards";
import { assertOwnership } from "@/lib/middleware/withRole";
import { leadStatusSchema } from "@/lib/validation/leads";
import * as leadsService from "@/lib/services/leads.service";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// PATCH /api/leads/[id] → update status. Provider: own company only; Admin: any.
export const PATCH = authed(async (request: NextRequest, ctx: Ctx, user) => {
  const { id } = await ctx.params;
  const { status } = leadStatusSchema.parse(await request.json());

  const isAdmin = user.role === "ADMIN";
  if (!isAdmin) {
    // 404 if the lead doesn't exist; 403 if it belongs to another company.
    const ownerCompanyId = await leadsService.getOwnerCompanyId(id);
    assertOwnership(user, ownerCompanyId);
  }

  // Providers must go through POST /provider/leads/[id]/complete to reach
  // COMPLETED, so the final amount is captured and the client's verification
  // gate can fire. Admins keep the direct set — see updateStatus's comment.
  return ok(await leadsService.updateStatus(id, status, { requireCompletion: !isAdmin }));
});
