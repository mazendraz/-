import type { NextRequest } from "next/server";
import { ok } from "@/lib/utils/response";
import { adminOnly } from "@/lib/middleware/guards";
import { availabilitySchema } from "@/lib/validation/availability";
import * as companiesService from "@/lib/services/companies.service";
import * as audit from "@/lib/services/audit.service";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// PATCH /api/admin/companies/[id]/availability → set a company's busy state.
export const PATCH = adminOnly(async (request: NextRequest, ctx: Ctx, user) => {
  const { id } = await ctx.params;
  const input = availabilitySchema.parse(await request.json());
  const result = await companiesService.setAvailability(id, input);
  await audit.record(user, {
    action: "company.availability",
    entity: "Company",
    entityId: id,
    meta: { busy: input.busy, busyUntil: input.busyUntil ?? null },
  });
  return ok(result);
});
