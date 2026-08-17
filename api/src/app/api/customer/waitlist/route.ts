import { withErrors } from "@/lib/utils/withErrors";
import { ok } from "@/lib/utils/response";
import { withCustomerAuth } from "@/lib/middleware/withCustomerAuth";
import * as waitlistService from "@/lib/services/waitlist.service";

export const dynamic = "force-dynamic";

// GET /api/v1/customer/waitlist → this account's own waitlist joins.
// The account-owned counterpart of GET /customer/leads for the OTHER kind of
// pending request a customer can have — mirrors the website's MyRequests.tsx,
// which merges leads and waitlist entries into one list.
export const GET = withErrors(
  withCustomerAuth(async (_request, _context, customer) =>
    ok(await waitlistService.listForCustomer(customer.id), 200, { "Cache-Control": "no-store" }),
  ),
);
