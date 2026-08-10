import type { NextRequest } from "next/server";
import { ok } from "@/lib/utils/response";
import { providerOnly } from "@/lib/middleware/guards";
import { ValidationError } from "@/lib/utils/errors";
import { readJsonObject } from "@/lib/middleware/bodyLimit";
import { submitChangeRequestSchema } from "@/lib/validation/changeRequests";
import * as changeRequests from "@/lib/services/changeRequests.service";

export const dynamic = "force-dynamic";

// GET /api/provider/change-requests?page=&pageSize= → ApiPage<ApiChangeRequest>.
// Paged: this is the provider's only record of what they submitted and how it was
// ruled on, so older entries must stay reachable rather than fall off a ceiling.
export const GET = providerOnly(async (request: NextRequest, _ctx, user) => {
  if (!user.companyId) throw new ValidationError("Your account isn't linked to a company yet.");
  const sp = request.nextUrl.searchParams;
  const toInt = (v: string | null): number | undefined => {
    if (v == null) return undefined;
    const n = Number.parseInt(v, 10);
    return Number.isFinite(n) ? n : undefined;
  };
  const STATUSES = ["PENDING", "APPROVED", "REJECTED", "CANCELLED"] as const;
  const ENTITIES = ["COMPANY", "OFFERING", "OFFERING_TIER", "BUNDLE_RULE"] as const;
  const status = sp.get("status");
  const entity = sp.get("entity");
  return ok(
    await changeRequests.listForCompany(user.companyId, {
      page: toInt(sp.get("page")),
      pageSize: toInt(sp.get("pageSize")),
      // Unrecognized values are ignored rather than rejected — an unknown filter
      // means "no filter", the same contract every other list endpoint uses.
      status: (STATUSES as readonly string[]).includes(status ?? "")
        ? (status as (typeof STATUSES)[number])
        : undefined,
      entity: (ENTITIES as readonly string[]).includes(entity ?? "")
        ? (entity as (typeof ENTITIES)[number])
        : undefined,
    }),
  );
});

// POST /api/provider/change-requests → file (or merge into) a pending request.
export const POST = providerOnly(async (request: NextRequest, _ctx, user) => {
  if (!user.companyId) throw new ValidationError("Your account isn't linked to a company yet.");
  // Bounded read. This body is provider-supplied and lands in a jsonb column, so
  // it gets the authoritative byte check rather than only the proxy's declared-
  // length one. 64KB is far above any real edit (the largest field is a 5000-char
  // `about`).
  const input = submitChangeRequestSchema.parse(await readJsonObject(request));
  const created = await changeRequests.submit(user, user.companyId, input);
  return ok(created, 201);
});
