/**
 * The signed-in customer's requests — the mobile counterpart of the website's
 * customerLeads.ts.
 *
 * No local "handover" step here the way the website has one: that logic exists
 * to reconcile a DEVICE's pre-account localStorage history with an account once
 * one is created — a migration path for customers who used the site before
 * sign-in existed. The app has no such history; every request submitted
 * through it will already carry the signed-in account's id at creation (see
 * api's leads/route.ts optionalCustomerId), so there is nothing to hand over.
 * If that migration is ever needed here, it belongs in lib/customerLeads.ts on
 * the website, not duplicated in a second place.
 */
import type { ApiLead } from "@alassema/core";
import { apiGet } from "./api";

/** Every request on the signed-in account, newest first — server-sorted. */
export function fetchAccountLeads(): Promise<ApiLead[]> {
  return apiGet<ApiLead[]>("/customer/leads");
}
