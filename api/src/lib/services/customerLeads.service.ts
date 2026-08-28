/**
 * Attaching past requests to a customer account, and listing what's attached.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 * Every request submitted before accounts existed has no owner, and `Lead`
 * carries no email — so there is NOTHING to match a new account against. Without
 * a way to claim them, the first thing a long-standing customer sees after
 * signing in is an empty list where their history should be.
 *
 * The credential for a claim is the one that already governs a request:
 * `refNumber` + `trackingToken`, exactly as /leads/track and the customer chat
 * gate use it. Nothing new is invented and nothing weaker is accepted — if you
 * can already read the request with these, attaching it to your account grants
 * you no access you didn't have.
 *
 * The phone-tail fallback that /leads/track still accepts for LEGACY leads
 * (trackingToken == null) is deliberately NOT accepted here: this is a batch
 * endpoint (50 references per call), and a batch turns a low-entropy secret into
 * an enumeration oracle. See LeadClaim in middleware/customerGuard.ts, which
 * makes the same cut for the same reason.
 */
import { prisma } from "@/lib/prisma";
import type { ApiLead } from "@/lib/apiTypes";
import { serializeLead } from "@/lib/utils/serialize";
import { leadInclude, leadSecretMatches } from "@/lib/services/leads.service";

export interface ClaimCandidate {
  refNumber: string;
  token?: string;
}

export type ClaimOutcome =
  | "claimed" // now attached to this account
  | "already" // already attached to THIS account — a no-op, not a failure
  | "rejected"; // no such ref, wrong secret, or owned by someone else

export interface ClaimResult {
  refNumber: string;
  outcome: ClaimOutcome;
}

/**
 * Attach one request to a customer account.
 *
 * ── The three refusals collapse into one ────────────────────────────────────
 * "No such reference", "wrong token", and "belongs to another account" all
 * return `rejected`, with nothing to tell them apart. Separating them would
 * make this an oracle for which reference numbers exist, which is the exact
 * thing the tracking gate is built to withhold.
 *
 * ── Never steal ──────────────────────────────────────────────────────────────
 * A lead already owned by a DIFFERENT account is refused even when the caller
 * presents a valid token. Two people can legitimately hold the same reference —
 * a request forwarded to a spouse, a shared phone — and "last claimer wins"
 * would let the second silently take the first's history, including the
 * conversation with the provider. First claim stands; support can move it.
 */
async function claimOne(customerId: string, candidate: ClaimCandidate): Promise<ClaimOutcome> {
  const refNumber = candidate.refNumber.trim().toUpperCase();
  if (!refNumber) return "rejected";

  const lead = await prisma.lead.findUnique({
    where: { refNumber },
    select: { id: true, trackingToken: true, phone: true, customerId: true },
  });

  if (!lead) return "rejected";
  // Token only — a legacy lead has no token and therefore cannot be claimed in
  // a batch. See the module comment.
  if (!leadSecretMatches(lead, { token: candidate.token })) {
    return "rejected";
  }
  if (lead.customerId === customerId) return "already";
  if (lead.customerId) return "rejected";

  // Conditional update: only claims a lead that is STILL unowned. Two devices
  // claiming the same reference at the same moment both pass the read above;
  // this is what makes the second one a no-op instead of an overwrite.
  const { count } = await prisma.lead.updateMany({
    where: { id: lead.id, customerId: null },
    data: { customerId },
  });

  return count === 1 ? "claimed" : "rejected";
}

/**
 * Claim a batch.
 *
 * A batch because the common case is not someone typing a reference number: it
 * is the device that submitted the requests in the first place, handing over
 * everything in its local history the moment its owner signs in. That should
 * cost one round trip, not one per request.
 *
 * Sequential rather than parallel — a batch is a handful of rows, and the
 * conditional update above wants a predictable order more than it wants speed.
 */
export async function claimLeads(
  customerId: string,
  candidates: ClaimCandidate[],
): Promise<ClaimResult[]> {
  const results: ClaimResult[] = [];
  for (const candidate of candidates) {
    results.push({
      refNumber: candidate.refNumber,
      outcome: await claimOne(customerId, candidate),
    });
  }
  return results;
}

/**
 * Every request belonging to this account, newest first.
 *
 * Served by the (customerId, createdAt) index added with the column.
 *
 * `trackingToken` is deliberately NOT returned. The account IS the credential
 * now; re-emitting the per-request secret would put a second, longer-lived key
 * into browser storage for no gain — and the device that submitted the request
 * already holds its own copy.
 */
export async function listForCustomer(customerId: string, limit = 100): Promise<ApiLead[]> {
  const rows = await prisma.lead.findMany({
    where: { customerId },
    include: leadInclude,
    orderBy: { createdAt: "desc" },
    // Bounded: an account's history is not a page the client should be able to
    // ask for unbounded, and no real customer approaches this.
    take: Math.min(Math.max(limit, 1), 200),
  });
  return rows.map(serializeLead);
}
