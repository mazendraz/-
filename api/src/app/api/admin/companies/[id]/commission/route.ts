import type { NextRequest } from "next/server";
import { ok } from "@/lib/utils/response";
import { desktopOnly } from "@/lib/middleware/guards";
import { companyCommissionSchema } from "@/lib/validation/finance";
import * as companiesService from "@/lib/services/companies.service";
import * as audit from "@/lib/services/audit.service";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// PATCH /api/admin/companies/[id]/commission → set/clear this company's
// commission % override (null = fall back to the platform default). Kept
// separate from the general company PUT — see companies.service.ts's comment.
export const PATCH = desktopOnly("finance:write", async (request: NextRequest, ctx: Ctx, user) => {
  const { id } = await ctx.params;
  const input = companyCommissionSchema.parse(await request.json());
  const result = await companiesService.setCommissionPercent(id, input.percent);
  await audit.record(user, {
    action: "company.commission",
    entity: "Company",
    entityId: id,
    meta: { percent: input.percent },
  });
  return ok(result);
});
