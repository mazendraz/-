/**
 * The signed-in customer's requests, and handing this device's history over to
 * their account.
 *
 * ── Why the handover is automatic ────────────────────────────────────────────
 * A request submitted before accounts existed has no owner, and `Lead` stores no
 * email — so nothing links it to a new account on its own. The obvious fix is a
 * form: type your reference number. The better one is that we already HAVE the
 * reference numbers and their tracking tokens, sitting in this device's
 * localStorage, for every request submitted from it.
 *
 * So on the first sign-in on a device, we send that list and the server attaches
 * whatever checks out. The customer types nothing and simply finds their history
 * where they expect it. The manual path stays available for a request submitted
 * from a different device — but it is the exception, not the default.
 *
 * This grants no new access: the reference + token pair is already what lets
 * this browser read and message about the request. It makes that right durable
 * instead of tied to one browser's storage.
 */
import { apiGet, apiPost, isApiConfigured } from "./api";
import type { Lead } from "./requests";

export type ClaimOutcome = "claimed" | "already" | "rejected";

export interface ClaimResult {
  refNumber: string;
  outcome: ClaimOutcome;
}

export interface ClaimCandidate {
  refNumber: string;
  token?: string;
  phone?: string;
}

/** Every request attached to the signed-in account, newest first. */
export function fetchAccountLeads(): Promise<Lead[]> {
  return apiGet<Lead[]>("/customer/leads");
}

/**
 * Attach past requests to the account. Per-item outcomes, never a thrown batch:
 * a device's history routinely contains entries already attached, and one of
 * those must not discard the rest.
 */
export async function claimLeads(candidates: ClaimCandidate[]): Promise<ClaimResult[]> {
  if (candidates.length === 0) return [];
  // Matches the server's per-call cap. A device with more history than this gets
  // the newest slice now and the rest on the next sign-in, which is far better
  // than a 400 that attaches nothing.
  const batch = candidates.slice(0, 50);
  const { results } = await apiPost<{ results: ClaimResult[] }>(
    "/customer/leads/claim",
    { claims: batch },
  );
  return results;
}

// Once per account per device. Kept in localStorage rather than memory so a
// reload doesn't re-send the whole history on every visit — the server treats a
// repeat as a harmless "already", but there is no reason to spend the round trip.
const HANDOVER_KEY = "al-assema-leads-handed-over";

function alreadyHandedOver(customerId: string): boolean {
  try {
    return localStorage.getItem(HANDOVER_KEY) === customerId;
  } catch {
    return false;
  }
}

function markHandedOver(customerId: string): void {
  try {
    localStorage.setItem(HANDOVER_KEY, customerId);
  } catch {
    /* private browsing — we'll just try again next time, which is safe */
  }
}

/**
 * Hand this device's request history to the account, at most once per account.
 *
 * Returns how many were newly attached, for the "we found your past requests"
 * message. Never throws: this runs in the background right after sign-in, and a
 * failure here must not turn a successful sign-in into an error. The next visit
 * retries, since the marker is only written on success.
 */
export async function handOverDeviceLeads(
  customerId: string,
  candidates: ClaimCandidate[],
): Promise<number> {
  if (!isApiConfigured() || candidates.length === 0) return 0;
  if (alreadyHandedOver(customerId)) return 0;

  try {
    const results = await claimLeads(candidates);
    markHandedOver(customerId);
    return results.filter((r) => r.outcome === "claimed").length;
  } catch {
    return 0;
  }
}
