import type { NextRequest } from "next/server";
import { ok } from "@/lib/utils/response";
import { providerOnly } from "@/lib/middleware/guards";
import { ValidationError } from "@/lib/utils/errors";
import { createOfferingSchema } from "@/lib/validation/offerings";
import * as offerings from "@/lib/services/offerings.service";

export const dynamic = "force-dynamic";

function companyOf(user: { companyId: string | null }): string {
  if (!user.companyId) throw new ValidationError("Your account isn't linked to a company yet.");
  return user.companyId;
}

// GET /api/provider/offerings → everything this company owns, drafts included.
export const GET = providerOnly(async (_req: NextRequest, _ctx, user) => {
  return ok(await offerings.listForCompany(companyOf(user)));
});

// POST /api/provider/offerings → always creates a DRAFT (isPublished = false).
// Nothing a provider types reaches the public profile without an approval.
export const POST = providerOnly(async (request: NextRequest, _ctx, user) => {
  const input = createOfferingSchema.parse(await request.json());
  return ok(await offerings.create(companyOf(user), input), 201);
});
