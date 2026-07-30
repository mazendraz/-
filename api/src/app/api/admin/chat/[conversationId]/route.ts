import type { NextRequest } from "next/server";
import { ok } from "@/lib/utils/response";
import { adminOnly } from "@/lib/middleware/guards";
import { readJsonObject } from "@/lib/middleware/bodyLimit";
import { stripHtml } from "@/lib/utils/sanitize";
import * as chat from "@/lib/services/chat.service";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ conversationId: string }> };

// GET /api/admin/chat/:conversationId?after=
// The admin view is the ONLY one that includes hidden messages — moderation must
// not destroy the record of what was said.
export const GET = adminOnly(async (request: NextRequest, ctx: Ctx) => {
  const { conversationId } = await ctx.params;
  const afterRaw = new URL(request.url).searchParams.get("after");
  const after = afterRaw && /^\d+$/.test(afterRaw) ? Number(afterRaw) : undefined;
  return ok(await chat.getThread(conversationId, "admin", after), 200, { "Cache-Control": "no-store" });
});

// POST — the admin steps in. Sent as ADMIN so both sides can see it came from
// Al Assema rather than from the other party.
export const POST = adminOnly(async (request: NextRequest, ctx: Ctx, user) => {
  const { conversationId } = await ctx.params;
  const raw = await readJsonObject(request);
  const body = stripHtml(String((raw as { body?: unknown }).body ?? ""));
  const message = await chat.postMessage({
    conversationId, sender: "ADMIN", senderUserId: user.id, body,
  });
  return ok(message, 201, { "Cache-Control": "no-store" });
});

// PATCH /api/admin/chat/:conversationId → { closed: boolean }
export const PATCH = adminOnly(async (request: NextRequest, ctx: Ctx, user) => {
  const { conversationId } = await ctx.params;
  const raw = await readJsonObject(request);
  const closed = Boolean((raw as { closed?: unknown }).closed);
  return ok(await chat.setClosed(user, conversationId, closed));
});
