import { withErrors } from "@/lib/utils/withErrors";
import { ok } from "@/lib/utils/response";
import { withCustomerAuth } from "@/lib/middleware/withCustomerAuth";
import * as customerLeads from "@/lib/services/customerLeads.service";

export const dynamic = "force-dynamic";

// GET /api/v1/customer/leads → ApiLead[] — every request attached to this account.
//
// The account is the credential; nothing else is accepted and no per-request
// token is returned. Cache-Control matters here: a customer's request history
// behind a shared proxy is exactly the kind of thing that must never be stored.
export const GET = withErrors(
  withCustomerAuth(async (_request, _context, customer) =>
    ok(await customerLeads.listForCustomer(customer.id), 200, {
      "Cache-Control": "no-store",
    }),
  ),
);
