import type { NextRequest } from "next/server";
import { ok } from "@/lib/utils/response";
import { providerOnly } from "@/lib/middleware/guards";
import { assertOwnership } from "@/lib/middleware/withRole";
import { completeLeadSchema } from "@/lib/validation/leadCompletion";
import * as leadsService from "@/lib/services/leads.service";
import * as leadCompletionService from "@/lib/services/leadCompletion.service";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/provider/leads/[id]/complete → 201 + ApiLead. Provider marks a lead
// (their own company's only — same ownership check as PATCH /api/leads/[id])
// completed with the final amount. 409 if already completed.
export const POST = providerOnly(async (request: NextRequest, ctx: Ctx, user) => {
  const { id } = await ctx.params;
  const payload = completeLeadSchema.parse(await request.json());

  const ownerCompanyId = await leadsService.getOwnerCompanyId(id);
  assertOwnership(user, ownerCompanyId);

  return ok(await leadCompletionService.submitCompletion(id, payload), 201);
});
