import type { NextRequest } from "next/server";
import { ok } from "@/lib/utils/response";
import { providerOnly } from "@/lib/middleware/guards";
import { ValidationError } from "@/lib/utils/errors";
import { submitChangeRequestSchema } from "@/lib/validation/changeRequests";
import * as changeRequests from "@/lib/services/changeRequests.service";

export const dynamic = "force-dynamic";

// GET /api/provider/change-requests → this provider's recent requests.
export const GET = providerOnly(async (_request: NextRequest, _ctx, user) => {
  if (!user.companyId) throw new ValidationError("Your account isn't linked to a company yet.");
  return ok(await changeRequests.listForCompany(user.companyId));
});

// POST /api/provider/change-requests → file (or merge into) a pending request.
export const POST = providerOnly(async (request: NextRequest, _ctx, user) => {
  if (!user.companyId) throw new ValidationError("Your account isn't linked to a company yet.");
  const input = submitChangeRequestSchema.parse(await request.json());
  const created = await changeRequests.submit(user, user.companyId, input);
  return ok(created, 201);
});
