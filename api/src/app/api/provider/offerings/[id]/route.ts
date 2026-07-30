import type { NextRequest } from "next/server";
import { ok } from "@/lib/utils/response";
import { providerOnly } from "@/lib/middleware/guards";
import { NotFoundError, ValidationError } from "@/lib/utils/errors";
import { prisma } from "@/lib/prisma";
import { updateOfferingSchema, mergedOfferingSchema } from "@/lib/validation/offerings";
import * as offerings from "@/lib/services/offerings.service";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

function companyOf(user: { companyId: string | null }): string {
  if (!user.companyId) throw new ValidationError("Your account isn't linked to a company yet.");
  return user.companyId;
}

// PATCH /api/provider/offerings/:id
//
// Draft → written straight through. Published → the row is NOT touched; a
// ChangeRequest is filed and the live listing carries on unchanged until an
// admin acts. The service decides which (see assertWritePath), never the route.
export const PATCH = providerOnly(async (request: NextRequest, ctx: Ctx, user) => {
  const { id } = await ctx.params;
  const companyId = companyOf(user);
  const patch = updateOfferingSchema.parse(await request.json());

  // Pricing consistency is a property of the RESULTING row, not of the patch.
  // "set pricingModel = FIXED" is only valid against whatever priceMin already
  // holds, so merge the patch over the current row and validate that shape —
  // otherwise a two-step edit can leave the row in a state neither request
  // would have been allowed to create.
  const current = await prisma.offering.findUnique({ where: { id } });
  if (!current || current.companyId !== companyId) throw new NotFoundError("Offering");

  mergedOfferingSchema.parse({
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
  });

  return ok(await offerings.update(user, companyId, id, patch));
});

// DELETE /api/provider/offerings/:id — a draft goes immediately, a published
// offering needs approval (the row stays live meanwhile).
export const DELETE = providerOnly(async (_req: NextRequest, ctx: Ctx, user) => {
  const { id } = await ctx.params;
  return ok(await offerings.remove(user, companyOf(user), id));
});
