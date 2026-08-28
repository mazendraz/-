import { useEffect, useState } from "react";
import { useCustomerAuth } from "../lib/customerAuth";
import { fetchAccountLeads, handOverDeviceLeads } from "../lib/customerLeads";
import { absorbAccountLeads, getMyLeadClaims } from "../lib/requests";
import {
  absorbAccountWaitlistEntries,
  fetchAccountWaitlistEntries,
} from "../lib/availability";
import { isApiConfigured, isAbort } from "../lib/api";

/**
 * Reconciles the signed-in account's requests with this device's.
 *
 * Runs once per page load while signed in, in two steps that have to be in this
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
 * ── Why this is mounted in RootLayout, not on one page ───────────────────────
 * It used to run only inside My Requests. Everything else that shows a
 * customer's own history — the messages list, the conversation badge, the
 * price-verification gate — reads the SAME local cache and so saw nothing until
 * that one page happened to be visited. Sign in on a new browser, open
 * Messages, and it was empty: not because the conversations were gone, but
 * because nothing had asked the server for them yet. Reconciling in the layout
 * means every route gets the account's data, and no page needs to know accounts
 * exist.
 */

/**
 * Once per customer per page load, ACROSS instances — RootLayout and My
 * Requests both mount this hook, and a per-instance guard would mean two
 * handovers and two pulls racing each other on every visit to that page.
 */
let syncFor: string | null = null;
let syncPromise: Promise<number> | null = null;

function syncAccount(customerId: string, claims: ReturnType<typeof getMyLeadClaims>) {
  if (syncFor === customerId && syncPromise) return syncPromise;

  syncFor = customerId;
  syncPromise = (async () => {
    // Never throws — a failed handover must not stop the pull, which is what
    // shows requests submitted from other devices.
    //
    // getMyLeadClaims() calls the reference `ref` (it was built for the chat
    // gate's query param); the claim API calls it `refNumber`, matching the
    // column. Renamed here rather than in either of them — both names are
    // right where they live.
    const newlyClaimed = await handOverDeviceLeads(
      customerId,
      claims.map((c) => ({ refNumber: c.ref, token: c.token })),
    );

    // Both pulls together: a customer's "My Requests" is the union of the two,
    // and failing one must not sink the other.
    const [leads, waitlist] = await Promise.allSettled([
      fetchAccountLeads(),
      fetchAccountWaitlistEntries(),
    ]);
    if (leads.status === "fulfilled") absorbAccountLeads(leads.value);
    else if (!isAbort(leads.reason)) console.warn("Account leads sync failed:", leads.reason);
    if (waitlist.status === "fulfilled") absorbAccountWaitlistEntries(waitlist.value);
    else if (!isAbort(waitlist.reason)) {
      console.warn("Account waitlist sync failed:", waitlist.reason);
    }

    return newlyClaimed;
  })();

  return syncPromise;
}

/**
 * See the note at the top of this file for what the sync does and where it is
 * mounted.
 *
 * `claimed` is how many past requests were newly attached, so a page can say so
 * once rather than leaving the list to silently grow.
 */
export function useAccountLeads(): {
  claimed: number;
  syncing: boolean;
  /**
   * True once there is nothing left to wait for — the account's requests have
   * been pulled, or there is no account to pull them from. RootLayout holds
   * first paint on this for the same reason it holds on useMyLeadsHydrated: a
   * pending price verification on an ACCOUNT-owned request must be decided from
   * the server's answer, not from whatever this browser had cached before.
   */
  settled: boolean;
} {
  const { customer, loading } = useCustomerAuth();

  const [claimed, setClaimed] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    // Still asking who this is — deciding either way now would be guessing.
    if (loading) return;
    if (!customer || !isApiConfigured()) {
      setSettled(true);
      return;
    }

    let active = true;
    setSyncing(true);
    // Reads the claims at call time rather than taking them as a dependency:
    // useMyLeadClaims() rebuilds its array on every render, which would make
    // this effect re-run forever.
    syncAccount(customer.id, getMyLeadClaims())
      .then((n) => {
        if (active && n > 0) setClaimed(n);
      })
      .finally(() => {
        if (!active) return;
        setSyncing(false);
        setSettled(true);
      });

    return () => {
      active = false;
    };
  }, [customer, loading]);

  return { claimed, syncing, settled };
}
