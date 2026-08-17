import type { NextRequest } from "next/server";
import { getCustomerUser } from "@/lib/auth";
import { UnauthorizedError } from "@/lib/utils/errors";

/**
 * The signed-in customer's id, or null — for a route that stays PUBLIC
 * (an anonymous visitor may still call it) but attaches the account when one
 * is present. Originally written inline in leads/route.ts; pulled out once a
 * second route (waitlist join) needed the exact same behavior, rather than
 * copy it a second time.
 *
 * Swallows the 401 deliberately: on these routes "not signed in" is a
 * legitimate state, not a failure. Only an UnauthorizedError is swallowed, so
 * a genuine fault (the database being unreachable inside getCustomerUser)
 * still surfaces instead of being silently recorded as anonymous.
 */
export async function optionalCustomerId(request: NextRequest): Promise<string | null> {
  try {
    const customer = await getCustomerUser(request);
    return customer.id;
  } catch (err) {
    if (err instanceof UnauthorizedError) return null;
    throw err;
  }
}
