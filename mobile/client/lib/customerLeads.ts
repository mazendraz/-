/**
 * The signed-in customer's requests — the mobile counterpart of the website's
 * customerLeads.ts.
 *
 * ── Why the "handover" step DOES belong here after all ──────────────────────
 * This module used to argue the opposite: that the website's handOverDeviceLeads
 * exists only to migrate a pre-account localStorage history, and that the app
 * needs nothing equivalent because "every request submitted through it will
 * already carry the signed-in account's id at creation".
 *
 * That assumption is not safe, and a real customer hit it. POST /leads resolves
 * the account with optionalCustomerId (api's leads/route.ts) — OPTIONAL: if no
 * usable Authorization header reaches it, the lead is still created, just with
 * no customerId, and it then never appears under "My Requests" with no error
 * anywhere to explain the disappearance. That is precisely what happened while
 * lib/session.ts was discarding tokens on web: the order submitted fine and was
 * simply orphaned. The storage bug is fixed, but the failure mode is inherent
 * to an optional-auth create endpoint (an access token expiring mid-session
 * with a failed refresh reproduces it), so the app needs the same recovery path
 * the website already has rather than trusting that it can't happen.
 */
import type { ApiLead } from "@alassema/core";
import { apiGet, apiPost } from "./api";
import { allLeadTokens } from "./leadTokens";

/** Every request on the signed-in account, newest first — server-sorted. */
export function fetchAccountLeads(): Promise<ApiLead[]> {
  return apiGet<ApiLead[]>("/customer/leads");
}

type ClaimOutcome = "claimed" | "already" | "rejected";

/**
 * Attach any request this device created but that the account does not own to
 * the signed-in account, proved with the tracking token captured at submission
 * (lib/leadTokens.ts). Returns how many were NEWLY attached.
 *
 * ── Why this diffs instead of running once per account ──────────────────────
 * The obvious shape — a "already handed over" marker per customer id, which is
 * what the website uses — is wrong for the failure this exists to repair. That
 * marker assumes orphaning can only happen ONCE, before the account existed.
 * It can't: POST /leads takes the account optionally (api's optionalCustomerId),
 * so any request submitted while the access token is missing or unrefreshable
 * lands unattached — at any time, including long after the first sign-in. With
 * a permanent marker, that lead would never be claimed on this device again,
 * and it would show on the website (which lists what the BROWSER submitted,
 * merged with the account — see app/src/lib/requests.ts absorbAccountLeads)
 * while staying invisible in the app, which only ever asks the server what the
 * ACCOUNT owns. That divergence is exactly what a customer reported seeing
 * across the two clients.
 *
 * Diffing against the account's own list instead costs one GET that the caller
 * pays for anyway on launch, sends nothing when there is nothing to attach, and
 * self-heals whenever a lead is orphaned later.
 *
 * Never throws: this runs in the background right after sign-in, and a failure
 * here must not turn a successful sign-in into an error.
 */
export async function claimDeviceLeads(): Promise<number> {
  try {
    const known = await allLeadTokens();
    if (known.length === 0) return 0;

    const owned = new Set((await fetchAccountLeads()).map((l) => l.refNumber));
    const claims = known.filter((c) => !owned.has(c.refNumber));
    if (claims.length === 0) return 0;

    // The endpoint caps a batch at 50 (claimLeadsSchema); a device realistically
    // never approaches that, but slicing keeps a pathological store from 400ing
    // the whole call instead of claiming what it can.
    const { results } = await apiPost<{ results: { refNumber: string; outcome: ClaimOutcome }[] }>(
      "/customer/leads/claim",
      { claims: claims.slice(0, 50) },
    );

    return results.filter((r) => r.outcome === "claimed").length;
  } catch {
    return 0;
  }
}
