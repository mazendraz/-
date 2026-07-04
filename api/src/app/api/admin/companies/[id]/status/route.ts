import type { NextRequest } from "next/server";
import { ok } from "@/lib/utils/response";
import { adminOnly } from "@/lib/middleware/guards";
import { companyStatusSchema } from "@/lib/validation/companies";
import * as companiesService from "@/lib/services/companies.service";
import * as audit from "@/lib/services/audit.service";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// PATCH /api/admin/companies/[id]/status → ACTIVE | INACTIVE | SUSPENDED
export const PATCH = adminOnly(async (request: NextRequest, ctx: Ctx, user) => {
  const { id } = await ctx.params;
  const { status } = companyStatusSchema.parse(await request.json());
  const result = await companiesService.setStatus(id, status);
  await audit.record(user, { action: "company.status", entity: "Company", entityId: id, meta: { status } });
  return ok(result);
});
