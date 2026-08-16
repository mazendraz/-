// Auth middleware for CUSTOMER routes. Composes with withErrors exactly like
// withAuth does:
//
//   export const GET = withErrors(withCustomerAuth(async (req, ctx, customer) => { ... }));
//
// Separate from withAuth rather than a flag on it: the two resolve different
// tables and hand the handler different shapes, and a route picks its population
// by which wrapper it reaches for. A staff token reaching a customer route (or
// the reverse) fails inside verifyTokenAs on the `typ` claim — see auth.ts.
import type { NextRequest } from "next/server";
import { getCustomerUser, type CustomerAuthUser } from "@/lib/auth";

/** Inner handler shape: the request, the route context, and the customer. */
export type CustomerHandler<Ctx = unknown> = (
  request: NextRequest,
  context: Ctx,
  customer: CustomerAuthUser,
) => Response | Promise<Response>;

export function withCustomerAuth<Ctx>(
  handler: CustomerHandler<Ctx>,
): (request: NextRequest, context: Ctx) => Promise<Response> {
  return async (request, context) => {
    const customer = await getCustomerUser(request);
    return handler(request, context, customer);
  };
}
