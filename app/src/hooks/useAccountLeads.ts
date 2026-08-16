import { useEffect, useRef, useState } from "react";
import { useCustomerAuth } from "../lib/customerAuth";
import { fetchAccountLeads, handOverDeviceLeads } from "../lib/customerLeads";
import { absorbAccountLeads, useMyLeadClaims } from "../lib/requests";
import { isApiConfigured, isAbort } from "../lib/api";

/**
 * Reconciles the signed-in account's requests with this device's.
 *
 * Runs once per mount while signed in, in two steps that have to be in this
 * order:
 *
 *   1. HAND OVER — send this device's reference numbers and tracking tokens so
 *      the server attaches any that aren't yet owned. Without this, a customer
 *      who has been using the site for months signs in and finds nothing.
 *   2. PULL — fetch everything the account owns (including requests claimed
 *      just now, and any submitted from another device) and fold it into the
 *      local cache, where useMyLeads() picks it up.
 *
 * Doing the pull first would return an empty list on the very sign-in where the
 * handover matters most, and show an empty state for one render.
 *
 * Returns `claimed`: how many past requests were newly attached, so the page can
 * say so once rather than leaving the list to silently grow.
 */
export function useAccountLeads(): { claimed: number; syncing: boolean } {
  const { customer, loading } = useCustomerAuth();
  const deviceClaims = useMyLeadClaims();

  const [claimed, setClaimed] = useState(0);
  const [syncing, setSyncing] = useState(false);
  // One reconciliation per mount. `deviceClaims` is a fresh array every render
  // and would re-trigger an effect that depends on it forever; the ref is what
  // keeps this from becoming a request loop.
  const done = useRef(false);

  useEffect(() => {
    if (done.current || loading || !customer || !isApiConfigured()) return;
    done.current = true;

    let active = true;
    setSyncing(true);

    (async () => {
      // Never throws — a failed handover must not stop the pull, which is what
      // shows requests submitted from other devices.
      //
      // useMyLeadClaims() calls the reference `ref` (it was built for the chat
      // gate's query param); the claim API calls it `refNumber`, matching the
      // column. Renamed here rather than in either of them — both names are
      // right where they live.
      const newlyClaimed = await handOverDeviceLeads(
        customer.id,
        deviceClaims.map((c) => ({ refNumber: c.ref, token: c.token, phone: c.phone })),
      );
      if (active && newlyClaimed > 0) setClaimed(newlyClaimed);

      try {
        const leads = await fetchAccountLeads();
        if (active) absorbAccountLeads(leads);
      } catch (err) {
        // Navigating away rejects the in-flight fetch; that is not a failure.
        // Anything else leaves the device's own view intact, which is a
        // reasonable thing to be looking at.
        if (!isAbort(err)) console.warn("Account leads sync failed:", err);
      } finally {
        if (active) setSyncing(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [customer, loading, deviceClaims]);

  return { claimed, syncing };
}
