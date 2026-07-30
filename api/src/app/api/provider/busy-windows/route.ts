import type { NextRequest } from "next/server";
import { ok } from "@/lib/utils/response";
import { providerOnly } from "@/lib/middleware/guards";
import { ValidationError } from "@/lib/utils/errors";
import { busyWindowSchema } from "@/lib/validation/busyWindows";
import * as busyWindows from "@/lib/services/busyWindows.service";

export const dynamic = "force-dynamic";

function companyOf(user: { companyId: string | null }): string {
  if (!user.companyId) throw new ValidationError("Your account isn't linked to a company yet.");
  return user.companyId;
}

// GET /api/provider/busy-windows → running + upcoming periods for this company.
export const GET = providerOnly(async (_req: NextRequest, _ctx, user) => {
  return ok(await busyWindows.listForCompany(companyOf(user)));
});

// POST /api/provider/busy-windows → schedule a period.
// Creating an open-ended one closes any existing open-ended period first (see
// the service): two of those would overlap every future window forever and make
// scheduling impossible.
export const POST = providerOnly(async (request: NextRequest, _ctx, user) => {
  const input = busyWindowSchema.parse(await request.json());
  return ok(await busyWindows.create(user, companyOf(user), input, false), 201);
});
