import type { NextRequest } from "next/server";
import { withErrors } from "@/lib/utils/withErrors";
import { ok } from "@/lib/utils/response";
import { ValidationError } from "@/lib/utils/errors";
import { withCustomerAuth } from "@/lib/middleware/withCustomerAuth";
import { withMaintenance } from "@/lib/middleware/maintenance";
import { readJsonObject } from "@/lib/middleware/bodyLimit";
import * as favorites from "@/lib/services/customerFavorites.service";
import { channelForCustomer, publish } from "@/lib/services/realtime.service";

export const dynamic = "force-dynamic";

/**
 * The signed-in account's saved companies.
 *
 * Every handler here takes the customer from `withCustomerAuth` and NEVER from
 * the body — a client-supplied customer id is the one thing that would turn
 * this into a way to read or edit somebody else's shortlist.
 *
 * The response is always the account's FULL list, not a delta. It costs one
 * small query and it removes a whole class of client bug: a device that missed
 * an event, or applied two changes out of order, is corrected by the next call
 * it makes rather than drifting until something forces a reload.
 */

// GET /api/v1/customer/favorites → { slugs: string[] }
export const GET = withErrors(
  withCustomerAuth(async (_request, _context, customer) =>
    ok({ slugs: await favorites.list(customer.id) }, 200, { "Cache-Control": "no-store" }),
  ),
);

function readSlug(raw: Record<string, unknown>): string {
  const slug = typeof raw.slug === "string" ? raw.slug.trim() : "";
  if (!slug) throw new ValidationError("Validation failed", { slug: ["Required"] });
  return slug;
}

/**
 * POST /api/v1/customer/favorites
 *
 *   { slug }            → save one company
 *   { merge: string[] } → fold this device's local list in (sign-in handover)
 *
 * Both return the account's full list. The merge mode is additive and never
 * deletes — see the service's own note on why an absence locally is not
 * evidence of a removal.
 */
export const POST = withErrors(
  withMaintenance(
    withCustomerAuth(async (request: NextRequest, _context, customer) => {
      const raw = await readJsonObject(request, 8 * 1024);

      if (Array.isArray(raw.merge)) {
        const slugs = raw.merge.filter((s): s is string => typeof s === "string");
        const list = await favorites.merge(customer.id, slugs);
        notify(customer.id);
        return ok({ slugs: list });
      }

      const list = await favorites.add(customer.id, readSlug(raw));
      notify(customer.id);
      return ok({ slugs: list });
    }),
  ),
);

// DELETE /api/v1/customer/favorites  { slug } → unsave one company.
//
// A body on DELETE rather than a path segment, because the client holds a slug
// and the alternative (/favorites/[slug]) would have meant a second route file
// for the same one-field decision.
export const DELETE = withErrors(
  withMaintenance(
    withCustomerAuth(async (request: NextRequest, _context, customer) => {
      const raw = await readJsonObject(request, 1024);
      const list = await favorites.remove(customer.id, readSlug(raw));
      notify(customer.id);
      return ok({ slugs: list });
    }),
  ),
);

/**
 * Tell the account's OTHER clients to refetch.
 *
 * Scoped to this customer's own channel and carrying no payload, matching every
 * other event on this hub: the receiver refetches through the GET above, which
 * is authenticated, so a subscription bug can cost a wasted request and never a
 * leak. Published after the database write has resolved — an event for a change
 * that did not happen is worse than no event.
 */
function notify(customerId: string): void {
  publish(channelForCustomer(customerId), { type: "favorite" });
}
