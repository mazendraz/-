import { NextResponse, type NextRequest } from "next/server";
import { ok } from "@/lib/utils/response";
import { adminOnly } from "@/lib/middleware/guards";
import { feedbackReadSchema } from "@/lib/validation/feedback";
import * as service from "@/lib/services/feedback.service";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// PATCH /api/admin/feedback/[id] → mark read/unread
export const PATCH = adminOnly(async (request: NextRequest, ctx: Ctx) => {
  const { id } = await ctx.params;
  const { isRead } = feedbackReadSchema.parse(await request.json());
  return ok(await service.markRead(id, isRead));
});

// DELETE /api/admin/feedback/[id] → 204
export const DELETE = adminOnly(async (_request: NextRequest, ctx: Ctx) => {
  const { id } = await ctx.params;
  await service.remove(id);
  return new NextResponse(null, { status: 204 });
});
