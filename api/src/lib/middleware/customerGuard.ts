// Resolves the customer behind a chat request. No account: the request's
// reference number plus its tracking token IS the credential, exactly like the
// existing public tracking gate.
//
// ── The token goes in a HEADER, never the query string ────────────────────────
// This looks like the same exposure as /leads/track?token=..., and it is not.
// Tracking writes the token to the access log ONCE per visit; a chat that polls
// every 8 seconds writes it HUNDREDS of times per conversation. That is a real
// amplification of where the secret ends up — log rotation, backups, and anyone
// with log-read access. Two lines to get right while writing this file; a
// migration to fix once it has shipped.
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { NotFoundError, ValidationError } from "@/lib/utils/errors";
import { leadSecretMatches } from "@/lib/services/leads.service";

export const LEAD_TOKEN_HEADER = "x-lead-token";

export interface CustomerLead {
  id: string;
  refNumber: string;
  companyId: string;
}

/**
 * Resolve `?ref=` + the `X-Lead-Token` header to the customer's own lead.
 *
 * A missing reference and a wrong token throw the SAME 404 — the endpoint must
 * never let someone probe which reference numbers exist. (Same reasoning as
 * trackByRefAndSecret in leads.service, whose comparison helper this reuses so
 * the timing-safe check and the legacy phone-tail fallback stay in one place.)
 */
export async function resolveCustomerLead(request: NextRequest): Promise<CustomerLead> {
  const url = new URL(request.url);
  const refNumber = url.searchParams.get("ref")?.trim();
  if (!refNumber) throw new ValidationError("A request reference is required.");

  const token = request.headers.get(LEAD_TOKEN_HEADER)?.trim() ?? undefined;
  // Legacy leads predate trackingToken and fall back to a phone match. Accepted
  // in a header too, never the query string.
  const phone = request.headers.get("x-lead-phone")?.trim() ?? undefined;

  const lead = await prisma.lead.findUnique({
    where: { refNumber },
    select: { id: true, refNumber: true, companyId: true, trackingToken: true, phone: true },
  });

  if (!lead || !leadSecretMatches(lead, { token, phone })) {
    throw new NotFoundError("Conversation");
  }
  return { id: lead.id, refNumber: lead.refNumber, companyId: lead.companyId };
}

/**
 * One (reference, secret) pair the customer is claiming to own.
 *
 * ── Why there is no `phone` here, unlike the single-lead path ───────────────
 * leadSecretMatches falls back to a phone-tail comparison for LEGACY leads
 * (trackingToken == null). On a single lookup that is a fair trade: the caller
 * still has to know the reference number, and the route is capped at 10-20
 * attempts a minute.
 *
 * In a BATCH it stops being fair. This endpoint takes 50 pairs per request at
 * 60 requests a minute, unauthenticated and with no CAPTCHA — 3,000 guesses a
 * minute against a per-day reference space of 36^4. Against a target whose
 * phone number the attacker already knows (which is the normal case: it is not
 * a secret), that turns a rate-limited lookup into a practical enumeration of
 * their requests, and from there their whole conversation with the provider.
 *
 * So the batch path accepts the high-entropy token ONLY. A legacy lead is still
 * reachable one at a time through /api/leads/track and /api/chat; it simply
 * cannot be found 50 references at a time.
 */
export interface LeadClaim {
  ref: string;
  token?: string;
}

/** Hard cap — a customer with more open requests than this is not a real case. */
export const MAX_CLAIMS = 50;

/**
 * Resolve a BATCH of claims, keeping only the ones whose secret checks out.
 *
 * Silently drops the ones that don't rather than throwing. A batch is assembled
 * from whatever this browser has in localStorage, which legitimately goes stale —
 * a request deleted by an admin, or a token from an older install. One dead entry
 * must not blank the customer's whole message list.
 *
 * Each claim is verified independently against its OWN lead, with the same
 * comparison helper as the single-lead path, so batching grants no access that
 * asking one at a time would not.
 */
export async function resolveCustomerLeads(claims: LeadClaim[]): Promise<CustomerLead[]> {
  const refs = [...new Set(claims.map((c) => c.ref.trim()).filter(Boolean))].slice(0, MAX_CLAIMS);
  if (refs.length === 0) return [];

  const leads = await prisma.lead.findMany({
    where: { refNumber: { in: refs } },
    select: { id: true, refNumber: true, companyId: true, trackingToken: true, phone: true },
  });

  // Grouped, not a ref→claim map. A Map keeps the LAST entry for a repeated key,
  // so a payload naming the same reference twice would have thrown away a valid
  // secret in favour of whichever came last. Access is granted when ANY supplied
  // secret for that reference verifies — which grants nothing extra, since
  // holding one correct secret is the whole test.
  const claimsByRef = new Map<string, LeadClaim[]>();
  for (const c of claims) {
    const ref = c.ref.trim();
    const list = claimsByRef.get(ref);
    if (list) list.push(c);
    else claimsByRef.set(ref, [c]);
  }

  return leads.flatMap((lead) => {
    const forRef = claimsByRef.get(lead.refNumber) ?? [];
    // Token only — see LeadClaim. Passing no phone means a legacy lead simply
    // never matches here, which is the intended outcome, not an oversight.
    const owns = forRef.some((c) => leadSecretMatches(lead, { token: c.token }));
    if (!owns) return [];
    return [{ id: lead.id, refNumber: lead.refNumber, companyId: lead.companyId }];
  });
}
