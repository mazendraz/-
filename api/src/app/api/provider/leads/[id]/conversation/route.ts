import type { NextRequest } from "next/server";
import { ok } from "@/lib/utils/response";
import { providerOnly } from "@/lib/middleware/guards";
import { assertOwnership } from "@/lib/middleware/withRole";
import * as leadsService from "@/lib/services/leads.service";
import * as chat from "@/lib/services/chat.service";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/provider/leads/[id]/conversation → 200 + ApiConversation. The
// single-lead counterpart of GET /provider/leads/[id] (same ownership check,
// same reason it exists): GET /provider/chat is a PAGED list of every
// thread, so "open the conversation for the lead I'm looking at right now"
// (from the lead detail screen) had no route to call without scrolling to
// find it. Every lead already has exactly one conversation, created eagerly
// at submission (see leads.service.ts's createLeadRecord) — this can only
// 404 on an id that isn't a lead at all.
export const GET = providerOnly(async (_request: NextRequest, ctx: Ctx, user) => {
  const { id } = await ctx.params;

  const ownerCompanyId = await leadsService.getOwnerCompanyId(id);
  assertOwnership(user, ownerCompanyId);

  return ok(await chat.getConversationForLead(id));
});
