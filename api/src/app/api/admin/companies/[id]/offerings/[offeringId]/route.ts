import type { NextRequest } from "next/server";
import { ok } from "@/lib/utils/response";
import { adminOnly } from "@/lib/middleware/guards";
import { NotFoundError } from "@/lib/utils/errors";
import { prisma } from "@/lib/prisma";
import { updateOfferingSchema, mergedOfferingSchema } from "@/lib/validation/offerings";
import * as offerings from "@/lib/services/offerings.service";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; offeringId: string }> };

// PATCH /api/admin/companies/:id/offerings/:offeringId → written straight
// through and published immediately, whatever state it was in before (see
// offerings.service.ts adminUpsert).
export const PATCH = adminOnly(async (request: NextRequest, ctx: Ctx, user) => {
  const { id, offeringId } = await ctx.params;
  const patch = updateOfferingSchema.parse(await request.json());

  const current = await prisma.offering.findUnique({ where: { id: offeringId } });
  if (!current || current.companyId !== id) throw new NotFoundError("Offering");

  // adminUpsert (unlike the provider's update()) takes a COMPLETE OfferingInput,
  // not a partial patch — it was built for create-or-replace, so an unmerged
  // partial would null out every field the admin didn't resend. Merge over the
  // current row first, same as the provider route validates against, and pass
  // THAT through: pricing consistency is a property of the resulting row, not
  // of the patch alone, and this doubles as that validation.
  const merged = {
    name: patch.name ?? current.name,
    description: patch.description !== undefined ? patch.description : current.description,
    kind: patch.kind ?? current.kind,
    pricingModel: patch.pricingModel ?? current.pricingModel,
    priceMin: patch.priceMin !== undefined ? patch.priceMin : current.priceMin,
    priceMax: patch.priceMax !== undefined ? patch.priceMax : current.priceMax,
    unit: patch.unit !== undefined ? patch.unit : current.unit,
    minQty: patch.minQty !== undefined ? patch.minQty : current.minQty,
    image: patch.image !== undefined ? patch.image : current.image,
    note: patch.note !== undefined ? patch.note : current.note,
  };
  mergedOfferingSchema.parse(merged);

  return ok(await offerings.adminUpsert(user, id, offeringId, merged));
});

// DELETE /api/admin/companies/:id/offerings/:offeringId → removed outright, no
// review, regardless of publish state (see offerings.service.ts adminRemove).
export const DELETE = adminOnly(async (_req: NextRequest, ctx: Ctx, user) => {
  const { id, offeringId } = await ctx.params;
  await offerings.adminRemove(user, id, offeringId);
  return ok({ ok: true });
});
