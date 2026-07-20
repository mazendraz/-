import type { NextRequest } from "next/server";
import { ok } from "@/lib/utils/response";
import { providerOnly } from "@/lib/middleware/guards";
import { ValidationError } from "@/lib/utils/errors";
import { availabilitySchema } from "@/lib/validation/availability";
import * as companiesService from "@/lib/services/companies.service";

export const dynamic = "force-dynamic";

// PATCH /api/provider/availability → set the provider's OWN company busy state.
export const PATCH = providerOnly(async (request: NextRequest, _ctx, user) => {
  if (!user.companyId) throw new ValidationError("Your account isn't linked to a company yet.");
  const input = availabilitySchema.parse(await request.json());
  return ok(await companiesService.setAvailability(user.companyId, input));
});
