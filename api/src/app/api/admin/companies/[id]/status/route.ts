import type { NextRequest } from "next/server";
import { ok } from "@/lib/utils/response";
import { adminOnly } from "@/lib/middleware/guards";
import { companyStatusSchema } from "@/lib/validation/companies";
import * as companiesService from "@/lib/services/companies.service";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// PATCH /api/admin/companies/[id]/status → ACTIVE | INACTIVE | SUSPENDED
export const PATCH = adminOnly(async (request: NextRequest, ctx: Ctx) => {
  const { id } = await ctx.params;
  const { status } = companyStatusSchema.parse(await request.json());
  return ok(await companiesService.setStatus(id, status));
});
