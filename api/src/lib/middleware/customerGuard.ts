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
