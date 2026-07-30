import type { NextRequest } from "next/server";
import { ok } from "@/lib/utils/response";
import { providerOnly } from "@/lib/middleware/guards";
import { ValidationError } from "@/lib/utils/errors";
import * as chat from "@/lib/services/chat.service";

export const dynamic = "force-dynamic";

// GET /api/provider/chat → this company's threads, most recently active first.
//
// Reads from Conversation, so a request nobody has opened a chat on yet does not
// appear here. That is intended: the provider reaches those from the leads list,
// and this view is for conversations that actually exist.
export const GET = providerOnly(async (_req: NextRequest, _ctx, user) => {
  if (!user.companyId) throw new ValidationError("Your account isn't linked to a company yet.");
  return ok(await chat.listForCompany(user.companyId), 200, { "Cache-Control": "no-store" });
});
