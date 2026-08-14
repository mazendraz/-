import type { NextRequest } from "next/server";
import { ok } from "@/lib/utils/response";
import { desktopOnly } from "@/lib/middleware/guards";
import { defaultCommissionSchema } from "@/lib/validation/finance";
import * as finance from "@/lib/services/finance.service";
import * as audit from "@/lib/services/audit.service";

export const dynamic = "force-dynamic";

// GET /api/admin/finance/settings/commission → { percent } — the platform-wide
// default commission % (AppSetting "default_commission_percent"). Company.
// commissionPercent overrides this per company — see companies/[id]/commission.
export const GET = desktopOnly("finance:read", async () => {
  return ok({ percent: await finance.getDefaultCommissionPercent() });
});

// PATCH /api/admin/finance/settings/commission → set the platform default.
export const PATCH = desktopOnly("finance:write", async (request: NextRequest, _ctx, user) => {
  const input = defaultCommissionSchema.parse(await request.json());
  await finance.setDefaultCommissionPercent(input.percent);
  await audit.record(user, {
    action: "finance.settings.default_commission",
    entity: "AppSetting",
    entityId: "default_commission_percent",
    meta: { percent: input.percent },
  });
  return ok({ percent: input.percent });
});
