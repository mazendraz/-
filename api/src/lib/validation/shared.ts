import { z } from "zod";

/**
 * Ceiling on any single EGP amount a client may send.
 *
 * Matches the per-unit `price` cap already used for offerings and tiers
 * (validation/offerings.ts), so the whole product agrees on what "an
 * implausibly large amount of money" is rather than each schema deciding
 * separately.
 *
 * It is also a STORAGE bound, and that is the half that bites. Every money
 * column in this schema is a Postgres `Int` (int4, max 2,147,483,647):
 * Lead.estimatedMin/Max, LeadItem.lineMin/Max, LeadCompletion.providerAmount /
 * additionalWorkAmount / clientAmount, and Transaction.amount. At 100,000,000:
 *   - a completion's finalTotal (providerAmount + additionalWorkAmount) tops out
 *     at 200,000,000 — comfortably inside int4;
 *   - the commission derived from it (at most 100%, see validation/finance.ts)
 *     also fits.
 * Without a cap, `z.number().int().min(0)` accepted anything up to
 * Number.MAX_SAFE_INTEGER, which either wrote an absurd figure into the ledger
 * or overflowed int4 and surfaced as an unhandled 500.
 */
export const MAX_MONEY_EGP = 100_000_000;

/** A whole-pound EGP amount from an untrusted client: non-negative and bounded. */
export const moneyEgp = z.number().int().min(0).max(MAX_MONEY_EGP);

// Image reference accepted by the admin endpoints:
//   - http(s) URL          (uploaded / external)
//   - data:image/... URL   (client-side compressed in the admin UI)
//   - /site-relative path  (seeded assets like /img/seed-01.jpg)
export const imageRef = z.string().refine(
  (v) =>
    /^https?:\/\//i.test(v) || /^data:image\//i.test(v) || v.startsWith("/"),
  { message: "Must be a URL, data URL, or site-relative path" },
);
