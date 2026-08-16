import type { NextRequest } from "next/server";
import { withErrors } from "@/lib/utils/withErrors";
import { withMaintenance } from "@/lib/middleware/maintenance";
import { ok } from "@/lib/utils/response";
import { ValidationError } from "@/lib/utils/errors";
import { clientIp } from "@/lib/middleware/rateLimit";
import { readJsonObject } from "@/lib/middleware/bodyLimit";
import { withCustomerAuth } from "@/lib/middleware/withCustomerAuth";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";
import * as customerDeletion from "@/lib/services/customerDeletion.service";

export const dynamic = "force-dynamic";

// POST /api/v1/customer/delete → { leadsDetached, sessionsRevoked }
//
// Irreversible. Requires the account's own email typed back in `confirmEmail`.
//
// ── Why a typed confirmation and not just the session ───────────────────────
// The session already proves who is asking; this proves they MEANT it. An
// account with no password (Google-only) has no secret to re-enter, so the
// deliberate-action gate has to be something everyone can produce — and typing
// your own address is a step nobody takes by accident, mis-tap, or by following
// a link someone sent them.
//
// NOT rate-limited: it needs a live session and the exact address, there is
// nothing to enumerate, and the second attempt has no account left to delete.
//
// Gated by maintenance, unlike session revocation next door. Maintenance means
// the database is not safe to write to, and this is the most destructive write
// in the product — a cascade across four tables that cannot be undone. Apple's
// requirement is that the capability EXISTS in the app, not that it survives a
// deploy window; "try again in a few minutes" is an honest answer here in a way
// it would not be for someone cutting off a stolen phone.
export const POST = withErrors(
  withMaintenance(
  withCustomerAuth(async (request: NextRequest, _context, customer) => {
    const raw = await readJsonObject(request, 4096);
    const confirmEmail =
      typeof raw.confirmEmail === "string" ? raw.confirmEmail.trim().toLowerCase() : "";

    if (confirmEmail !== customer.email.toLowerCase()) {
      throw new ValidationError("Type your email address exactly to confirm.");
    }

    const summary = await customerDeletion.deleteAccount(customer.id, clientIp(request));

    // Clear the cookie in the same response: the account behind it is gone, and
    // leaving the browser holding a token for a deleted user means every
    // subsequent request 401s with no explanation.
    const res = ok(summary);
    res.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions(), maxAge: 0 });
    return res;
  }),
  ),
);
