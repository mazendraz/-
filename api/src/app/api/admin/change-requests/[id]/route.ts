import type { NextRequest } from "next/server";
import { ok } from "@/lib/utils/response";
import { adminOnly } from "@/lib/middleware/guards";
import { reviewChangeRequestSchema } from "@/lib/validation/changeRequests";
import * as changeRequests from "@/lib/services/changeRequests.service";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/admin/change-requests/:id → request + conflict markers vs the live row.
export const GET = adminOnly(async (_request: NextRequest, ctx: Ctx) => {
  const { id } = await ctx.params;
  return ok(await changeRequests.getById(id));
});

// PATCH /api/admin/change-requests/:id → { action, reviewNote?, fields? }.
// `fields` narrows an approval to a subset (partial approval).
export const PATCH = adminOnly(async (request: NextRequest, ctx: Ctx, user) => {
  const { id } = await ctx.params;
  const input = reviewChangeRequestSchema.parse(await request.json());
  return ok(await changeRequests.review(user, id, input));
});
