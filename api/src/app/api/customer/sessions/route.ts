import type { NextRequest } from "next/server";
import { withErrors } from "@/lib/utils/withErrors";
import { ok } from "@/lib/utils/response";
import { withCustomerAuth } from "@/lib/middleware/withCustomerAuth";
import { readJsonObject } from "@/lib/middleware/bodyLimit";
import * as sessions from "@/lib/services/customerSession.service";

export const dynamic = "force-dynamic";

// GET /api/v1/customer/sessions → the account's live devices, newest use first.
//
// This is the screen a person opens because something feels wrong. It has to
// show every device that can currently get in — so it lists sessions, not
// "devices we chose to remember".
export const GET = withErrors(
  withCustomerAuth(async (_request, _context, customer) =>
    ok(await sessions.listActive(customer.id), 200, { "Cache-Control": "no-store" }),
  ),
);

// POST /api/v1/customer/sessions → revoke.
//
// `{ sessionId }` ends one device; an empty body ends them all. Both are
// scoped to the caller's own account inside the service, so a guessed id from
// another account matches nothing rather than revoking a stranger's session.
//
// POST rather than DELETE because it carries a body and has two modes; the
// alternative was two routes for one decision a person makes in one screen.
export const POST = withErrors(
  withCustomerAuth(async (request: NextRequest, _context, customer) => {
    const raw = await readJsonObject(request, 1024).catch(() => ({}) as Record<string, unknown>);
    const sessionId = typeof raw.sessionId === "string" ? raw.sessionId : null;

    if (sessionId) {
      await sessions.revoke(customer.id, sessionId);
      return ok({ revoked: 1 });
    }

    // "Sign out everywhere" — the answer to a lost phone, and the reason the
    // access token's short life matters: a revoked session stops refreshing
    // immediately, and the last access token it minted dies on its own.
    const revoked = await sessions.revokeAll(customer.id);
    return ok({ revoked });
  }),
);
