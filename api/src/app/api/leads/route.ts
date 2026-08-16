import type { NextRequest } from "next/server";
import { withErrors } from "@/lib/utils/withErrors";
import { ok } from "@/lib/utils/response";
import { RateLimitError, UnauthorizedError, ValidationError } from "@/lib/utils/errors";
import { getCustomerUser } from "@/lib/auth";
import { clientIp, rateLimit } from "@/lib/middleware/rateLimit";
import { readJsonObject } from "@/lib/middleware/bodyLimit";
import { verifyCaptcha } from "@/lib/middleware/captcha";
import { withMaintenance } from "@/lib/middleware/maintenance";
import { createLeadSchema } from "@/lib/validation/leads";
import * as leadsService from "@/lib/services/leads.service";

export const dynamic = "force-dynamic";

// Public submit is rate-limited per IP (bot/abuse protection).
const RATE_LIMIT = { limit: 5, windowMs: 60_000 };

// Circuit breakers INDEPENDENT of IP. The per-IP limit above stops one loud
// client; it does nothing against a botnet of 1,000 distinct IPs each staying
// under 5/min. These global caps put a ceiling on total lead volume so a
// distributed flood can't bury the pipeline — a spread attack trips the
// site-wide cap, a targeted one trips the per-company cap. Tune via env for
// legitimate traffic; too low and real customers get 429s at peak.
const SITE_LIMIT = {
  limit: Math.max(1, Math.trunc(Number(process.env.LEADS_SITE_RATE_LIMIT ?? "100")) || 100),
  windowMs: 60_000,
};
const COMPANY_LIMIT = {
  limit: Math.max(1, Math.trunc(Number(process.env.LEADS_COMPANY_RATE_LIMIT ?? "20")) || 20),
  windowMs: 60_000,
};

// A single generic 429 for every over-limit case — never leak which cap tripped
// (site-wide vs per-company vs per-IP), so an attacker can't probe the ceilings.
function tooMany(retryAfterMs: number): RateLimitError {
  const seconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
  return new RateLimitError(`Too many requests. Try again in ${seconds}s.`);
}

// POST /api/leads → 201 + RAW ApiLead. Resolves the company by slug (must be ACTIVE).
export const POST = withErrors(withMaintenance(async (request: NextRequest) => {
  const rl = await rateLimit(`leads:${clientIp(request)}`, RATE_LIMIT);
  if (!rl.ok) throw tooMany(rl.retryAfterMs);

  // Site-wide circuit breaker — checked early to shed a distributed flood before
  // we bother parsing/validating the body.
  const site = await rateLimit("leads:global", SITE_LIMIT);
  if (!site.ok) throw tooMany(site.retryAfterMs);

  // Bounded read: reject oversized bodies (413) before parsing.
  const raw = await readJsonObject(request);

  // Honeypot: real clients never fill `hp_field`; bots auto-fill every field.
  // (Named generically, NOT "website"/"email", so browser password managers don't
  // autofill it and falsely flag a real user — see the matching frontend input.)
  if (typeof (raw as { hp_field?: unknown }).hp_field === "string" &&
    (raw as { hp_field: string }).hp_field.trim() !== "") {
    throw new ValidationError("Submission rejected");
  }

  // CAPTCHA (no-op unless a secret is configured).
  await verifyCaptcha((raw as { captchaToken?: string }).captchaToken, clientIp(request));

  const payload = createLeadSchema.parse(raw);

  // Per-company circuit breaker — a flood aimed at one company trips this even
  // when spread across enough IPs to slip the per-IP limit. Keyed by the
  // (already-validated, lowercased) slug so it can't be split by casing tricks.
  const company = await rateLimit(
    `leads:company:${payload.companySlug.toLowerCase()}`,
    COMPANY_LIMIT,
  );
  if (!company.ok) throw tooMany(company.retryAfterMs);

  // Who is submitting, IF anyone is signed in. Optional on purpose:
  //
  // The website now gates the send behind sign-in, so real traffic arrives with
  // a session. Making it REQUIRED here is a separate, one-line decision — and a
  // dangerous one to take at the same time as shipping the gate. If anything
  // about the gate is wrong on the day it deploys, an optional attach loses the
  // account link on some requests; a required one loses the REQUESTS, which for
  // a lead-generation business is the whole product going dark.
  //
  // Flip it once the gate has been seen working in production.
  const customerId = await optionalCustomerId(request);

  const lead = await leadsService.create(payload, customerId);
  return ok(lead, 201);
}));

/**
 * The signed-in customer's id, or null.
 *
 * Swallows the 401 deliberately: on this route "not signed in" is a legitimate
 * state, not a failure. Only an UnauthorizedError is swallowed, so a genuine
 * fault (the database being down inside getCustomerUser) still surfaces instead
 * of being silently recorded as an anonymous request.
 */
async function optionalCustomerId(request: NextRequest): Promise<string | null> {
  try {
    const customer = await getCustomerUser(request);
    return customer.id;
  } catch (err) {
    if (err instanceof UnauthorizedError) return null;
    throw err;
  }
}
