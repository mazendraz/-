import type { NextRequest } from "next/server";
import { withErrors } from "@/lib/utils/withErrors";
import { withMaintenance } from "@/lib/middleware/maintenance";
import { ok } from "@/lib/utils/response";
import { readJsonObject } from "@/lib/middleware/bodyLimit";
import { withCustomerAuth } from "@/lib/middleware/withCustomerAuth";
import { categoryViewSchema } from "@/lib/validation/customerBrowsing";
import { recordCategoryView } from "@/lib/services/customerBrowsing.service";

export const dynamic = "force-dynamic";

// POST /api/v1/customer/category-view → fired (fire-and-forget from the
// client) whenever a signed-in customer opens a category screen. Feeds the
// 14-day inactive-browsing re-engagement email (notifications.reengagement
// .service.ts) — see CustomerUser.lastViewedCategory* in schema.prisma for
// why this is one overwritten row, not an event log. Signed-in customers
// only: a guest's browsing has no account to attach the signal to, and
// that's fine — they simply don't feed this particular email.
export const POST = withErrors(
  withMaintenance(
    withCustomerAuth(async (request: NextRequest, _context, customer) => {
      const { categorySlug } = categoryViewSchema.parse(await readJsonObject(request, 1024));
      await recordCategoryView(customer.id, categorySlug);
      return ok({ recorded: true });
    }),
  ),
);
