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
// Paged (?page=&pageSize=) — a company past the old fixed ceiling could not
// reach its older threads from any screen.
export const GET = providerOnly(async (request: NextRequest, _ctx, user) => {
  if (!user.companyId) throw new ValidationError("Your account isn't linked to a company yet.");
  const sp = request.nextUrl.searchParams;
  const toInt = (v: string | null): number | undefined => {
    if (v == null) return undefined;
    const n = Number.parseInt(v, 10);
    return Number.isFinite(n) ? n : undefined;
  };
  const result = await chat.listForCompany(user.companyId, {
    page: toInt(sp.get("page")),
    pageSize: toInt(sp.get("pageSize")),
  });
  return ok(result, 200, { "Cache-Control": "no-store" });
});
