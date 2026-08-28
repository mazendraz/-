import type { NextRequest } from "next/server";
import { ok } from "@/lib/utils/response";
import { providerOnly } from "@/lib/middleware/guards";
import { assertOwnership } from "@/lib/middleware/withRole";
import { NotFoundError } from "@/lib/utils/errors";
import * as leadsService from "@/lib/services/leads.service";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/provider/leads/[id] → 200 + ApiLead. One lead of the provider's own
// company, by id — the single-record read the list endpoint could not stand in
// for.
//
// The dashboard used to reach every lead through GET /provider/leads?pageSize=100
// alone, which meant a page addressed by lead id (the completion flow) could only
// render a lead that happened to be in that capped, already-fetched page. A lead
// created a moment ago — a waiting-list entry the provider just accepted — is not
// in it, and neither is anything past the newest 100, so opening or reloading
// such a page reported "not found" for a lead that plainly exists.
//
// Same ownership check as POST .../complete: getOwnerCompanyId 404s on an id that
// isn't a lead at all, and assertOwnership rejects another company's.
export const GET = providerOnly(async (_request: NextRequest, ctx: Ctx, user) => {
  const { id } = await ctx.params;

  const ownerCompanyId = await leadsService.getOwnerCompanyId(id);
  assertOwnership(user, ownerCompanyId);

  const lead = await leadsService.getById(id);
  if (!lead) throw new NotFoundError("Lead");

  return ok(lead);
});
