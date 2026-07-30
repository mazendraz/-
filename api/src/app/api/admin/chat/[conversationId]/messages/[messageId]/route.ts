import type { NextRequest } from "next/server";
import { ok } from "@/lib/utils/response";
import { adminOnly } from "@/lib/middleware/guards";
import { readJsonObject } from "@/lib/middleware/bodyLimit";
import * as chat from "@/lib/services/chat.service";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ conversationId: string; messageId: string }> };

// PATCH /api/admin/chat/:conversationId/messages/:messageId → { hidden: boolean }
//
// Hiding, not deleting: the message stops reaching the customer and the provider
// but stays in the table and stays visible to admins. Deleting it would destroy
// the evidence of exactly the behaviour that prompted the moderation.
export const PATCH = adminOnly(async (request: NextRequest, ctx: Ctx, user) => {
  const { conversationId, messageId } = await ctx.params;
  const raw = await readJsonObject(request);
  const hidden = Boolean((raw as { hidden?: unknown }).hidden);
  return ok(await chat.setMessageHidden(user, conversationId, messageId, hidden));
});
