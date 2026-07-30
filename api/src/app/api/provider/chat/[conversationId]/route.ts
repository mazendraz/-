import type { NextRequest } from "next/server";
import { ok } from "@/lib/utils/response";
import { providerOnly } from "@/lib/middleware/guards";
import { ValidationError } from "@/lib/utils/errors";
import { readJsonObject } from "@/lib/middleware/bodyLimit";
import { stripHtml } from "@/lib/utils/sanitize";
import * as chat from "@/lib/services/chat.service";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ conversationId: string }> };

function companyOf(user: { companyId: string | null }): string {
  if (!user.companyId) throw new ValidationError("Your account isn't linked to a company yet.");
  return user.companyId;
}

// GET /api/provider/chat/:conversationId?after=
// assertProviderAccess is the ownership gate — a thread belongs to exactly one
// company, and reading another's would expose a customer's private messages.
export const GET = providerOnly(async (request: NextRequest, ctx: Ctx, user) => {
  const { conversationId } = await ctx.params;
  await chat.assertProviderAccess(conversationId, companyOf(user));

  const afterRaw = new URL(request.url).searchParams.get("after");
  const after = afterRaw && /^\d+$/.test(afterRaw) ? Number(afterRaw) : undefined;

  const thread = await chat.getThread(conversationId, "provider", after);
  // A delta poll is not "the provider read it" — only a full open clears it.
  if (!after) await chat.markRead(conversationId, "provider");

  return ok(thread, 200, { "Cache-Control": "no-store" });
});

// POST /api/provider/chat/:conversationId
export const POST = providerOnly(async (request: NextRequest, ctx: Ctx, user) => {
  const { conversationId } = await ctx.params;
  await chat.assertProviderAccess(conversationId, companyOf(user));

  const raw = await readJsonObject(request);
  const body = stripHtml(String((raw as { body?: unknown }).body ?? ""));

  const message = await chat.postMessage({
    conversationId, sender: "PROVIDER", senderUserId: user.id, body,
  });
  return ok(message, 201, { "Cache-Control": "no-store" });
});
