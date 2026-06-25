import { NextResponse, type NextRequest } from "next/server";
import { ok } from "@/lib/utils/response";
import { adminOnly } from "@/lib/middleware/guards";
import { updateCompanySchema } from "@/lib/validation/companies";
import * as companiesService from "@/lib/services/companies.service";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// PUT /api/admin/companies/[id] → update
export const PUT = adminOnly(async (request: NextRequest, ctx: Ctx) => {
  const { id } = await ctx.params;
  const input = updateCompanySchema.parse(await request.json());
  return ok(await companiesService.update(id, input));
});

// DELETE /api/admin/companies/[id] → 204 (cascades projects/reviews/leads)
export const DELETE = adminOnly(async (_request: NextRequest, ctx: Ctx) => {
  const { id } = await ctx.params;
  await companiesService.remove(id);
  return new NextResponse(null, { status: 204 });
});
