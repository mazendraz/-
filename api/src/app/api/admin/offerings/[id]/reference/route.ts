import type { NextRequest } from "next/server";
import { ok } from "@/lib/utils/response";
import { adminOnly } from "@/lib/middleware/guards";
import { NotFoundError } from "@/lib/utils/errors";
import { prisma } from "@/lib/prisma";
import * as offerings from "@/lib/services/offerings.service";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/admin/offerings/:id/reference → category price reference for the
// review screen. An ADVISORY signal, never a constraint: decision 2 says the
// provider sets the price and the admin's approval is the control.
//
// PER_UNIT only, matched on the same unit — see priceReference() for why a
// median across FIXED/RANGE offerings would compare unrelated work and cry wolf.
export const GET = adminOnly(async (_req: NextRequest, ctx: Ctx) => {
  const { id } = await ctx.params;
  const offering = await prisma.offering.findUnique({
    where: { id },
    select: { id: true, companyId: true, pricingModel: true, unit: true, priceMin: true },
  });
  if (!offering) throw new NotFoundError("Offering");

  const reference = await offerings.priceReference(offering);
  return ok({
    reference,
    outlier: offering.priceMin != null && offerings.isPriceOutlier(offering.priceMin, reference),
  });
});
