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

  const requests = await changeRequests.listForCompany(user.companyId);
  return ok({
    company: serializeCompany(company),
    // Private contact fields are stripped from the public payload but the owner
    // is exactly who should see and edit them.
    contact: { email: company.email, whatsapp: company.whatsapp },
    changeRequests: requests,
    pending: requests.find((r) => r.status === "PENDING") ?? null,
  });
});
