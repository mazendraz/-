import type { NextRequest } from "next/server";
import { ok } from "@/lib/utils/response";
import { adminOnly } from "@/lib/middleware/guards";
import { createOfferingSchema } from "@/lib/validation/offerings";
import * as offerings from "@/lib/services/offerings.service";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/admin/companies/:id/offerings → everything the company has, drafts
// and pending-review ones included — the admin panel needs to see (and be able
// to directly finish) what a provider left mid-review, not just the live ones.
export const GET = adminOnly(async (_req: NextRequest, ctx: Ctx) => {
  const { id } = await ctx.params;
  return ok(await offerings.listForCompany(id));
});

// POST /api/admin/companies/:id/offerings → always published immediately (see
// offerings.service.ts adminUpsert) — an admin's own write needs no review.
export const POST = adminOnly(async (request: NextRequest, ctx: Ctx, user) => {
  const { id } = await ctx.params;
  const input = createOfferingSchema.parse(await request.json());
  return ok(await offerings.adminUpsert(user, id, null, input), 201);
});
