import type { NextRequest } from "next/server";
import { ok } from "@/lib/utils/response";
import { providerOnly } from "@/lib/middleware/guards";
import { NotFoundError, ValidationError } from "@/lib/utils/errors";
import { prisma } from "@/lib/prisma";
import { serializeCompany } from "@/lib/utils/serialize";
import * as changeRequests from "@/lib/services/changeRequests.service";

export const dynamic = "force-dynamic";

// GET /api/provider/profile → the provider's own company + its change requests.
// One round trip so the profile form can render the fields AND the "under review"
// banner without a second request.
export const GET = providerOnly(async (_request: NextRequest, _ctx, user) => {
  if (!user.companyId) throw new ValidationError("Your account isn't linked to a company yet.");

  const company = await prisma.company.findUnique({
    where: { id: user.companyId },
    include: {
      categories: {
        select: { isPrimary: true, category: { select: { slug: true, label: true, pricingMode: true } } },
        orderBy: { isPrimary: "desc" },
      },
      projects: true,
      reviews: true,
      // Running or upcoming only — the serializer derives effective availability
      // from these, and finished windows are history nothing reads.
      busyWindows: {
        where: { OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }] },
        orderBy: { startsAt: "asc" },
      },
    },
  });
  if (!company) throw new NotFoundError("Company");

  // Two queries, not one list scanned in memory.
  //
  // `pending` drives the "your edit is under review" banner, and it used to be
  // found with `.find()` over a list capped at 20. A provider with more history
  // than that could have their pending request sort past the cut — the banner
  // would quietly not render, the provider would read that as "my change was
  // never submitted", and the natural response is to submit it again.
  //
  // The DB guarantees at most one PENDING request per (entity, entityId) via a
  // partial unique index, so asking for it directly is exact rather than
  // probable.
  const [recent, pending] = await Promise.all([
    changeRequests.listForCompany(user.companyId, { pageSize: 20 }),
    changeRequests.listForCompany(user.companyId, {
      status: "PENDING",
      entity: "COMPANY",
      pageSize: 1,
    }),
  ]);

  return ok({
    company: serializeCompany(company),
    // Private contact fields are stripped from the public payload but the owner
    // is exactly who should see and edit them.
    contact: { email: company.email, whatsapp: company.whatsapp },
    // Still a bare array on the wire — the client's ProviderProfile type is
    // unchanged; only how it is obtained moved.
    changeRequests: recent.data,
    pending: pending.data[0] ?? null,
  });
});
