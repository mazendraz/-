import type { NextRequest } from "next/server";
import { withErrors } from "@/lib/utils/withErrors";
import { ok } from "@/lib/utils/response";
import { RateLimitError, ValidationError } from "@/lib/utils/errors";
import { optionalCustomerId } from "@/lib/middleware/optionalCustomer";
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

  // Who is submitting, IF anyone is signed in. Resolved BEFORE the CAPTCHA
  // because it decides whether one is needed at all — see below.
  //
  // (Optional on purpose: the website gates the send behind sign-in, so real
  // traffic arrives with a session. Making it REQUIRED here is a separate,
  // one-line decision — and a dangerous one to take at the same time as
  // shipping the gate. If anything about the gate is wrong on the day it
  // deploys, an optional attach loses the account link on some requests; a
  // required one loses the REQUESTS, which for a lead-generation business is
  // the whole product going dark. Flip it once the gate has been seen working
  // in production.)
  const customerId = await optionalCustomerId(request);

  // CAPTCHA — for ANONYMOUS submissions only, and a no-op unless a secret is
  // configured at all.
  //
  // A captcha answers one question: "is there a human behind this request?".
  // A signed-in customer has already answered it far more strongly — they
  // hold a session minted from a verified email address, and every submission
  // is attributable to that account and revocable with it. Demanding a
  // Cloudflare challenge on top buys nothing and costs the whole native app:
  // Turnstile is a BROWSER widget, and the only way to render it on a device
  // is a WebView whose origin is not on the site key's domain list, so it
  // answers with error 110200 and never issues a token. With a secret
  // configured, that made ordering from the mobile app impossible — the
  // submit button could never enable. (Verified against the live API: with no
  // secret set in production the gate was already inert; this makes the
  // behaviour intentional rather than accidental.)
  //
  // Anonymous callers are unchanged, and every other defence on this route —
  // the honeypot above, the per-IP limit, and the site-wide and per-company
  // circuit breakers below — applies to signed-in and anonymous alike.
  if (!customerId) {
    await verifyCaptcha((raw as { captchaToken?: string }).captchaToken, clientIp(request));
  }

  const payload = createLeadSchema.parse(raw);

  // Per-company circuit breaker — a flood aimed at one company trips this even
  // when spread across enough IPs to slip the per-IP limit. Keyed by the
  // (already-validated, lowercased) slug so it can't be split by casing tricks.
  const company = await rateLimit(
    `leads:company:${payload.companySlug.toLowerCase()}`,
    COMPANY_LIMIT,
  );
  if (!company.ok) throw tooMany(company.retryAfterMs);

  const lead = await leadsService.create(payload, customerId);
  return ok(lead, 201);
}));
