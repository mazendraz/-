import { withErrors } from "@/lib/utils/withErrors";
import { ok } from "@/lib/utils/response";
import { withCustomerAuth } from "@/lib/middleware/withCustomerAuth";
import type { ApiCustomer } from "@/lib/apiTypes";

export const dynamic = "force-dynamic";

// GET /api/v1/customer/me → the signed-in customer. 401 if absent/invalid.
//
// The apps call this on launch to decide between the signed-in and signed-out
// shell. It re-reads the row (getCustomerUser does) rather than trusting the
// token's claims, which is what makes a deactivated account fail here on the very
// next launch instead of when the token happens to expire.
//
// Deliberately NOT folded into /auth/me: that one resolves a STAFF user and would
// have to branch on token type, and a route that serves two populations is a
// route where the wrong one eventually gets served.
export const GET = withErrors(
  withCustomerAuth(async (_request, _context, customer) => {
    const body: ApiCustomer = customer;
    return ok(body);
  }),
);
