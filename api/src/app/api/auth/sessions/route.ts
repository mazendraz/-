import type { NextRequest } from "next/server";
import { withErrors } from "@/lib/utils/withErrors";
import { ok } from "@/lib/utils/response";
import { withAuth } from "@/lib/middleware/withAuth";
import { readJsonObject } from "@/lib/middleware/bodyLimit";
import * as staffSessions from "@/lib/services/staffSession.service";

export const dynamic = "force-dynamic";

// GET /api/v1/auth/sessions → the account's live devices, newest use first.
//
// Staff counterpart of GET /customer/sessions. This is the screen a provider
// or admin opens because something feels wrong — it has to show every device
// that can currently get in, so it lists sessions, not "devices we chose to
// remember".
export const GET = withErrors(
  withAuth(async (_request, _context, user) =>
    ok(await staffSessions.listActive(user.id), 200, { "Cache-Control": "no-store" }),
  ),
);

// POST /api/v1/auth/sessions → revoke.
//
// `{ sessionId }` ends one device; an empty body ends them all. Both are
// scoped to the caller's own account inside the service, so a guessed id
// from another account matches nothing rather than revoking a stranger's
// session. POST rather than DELETE — same reasoning as the customer route:
// it carries a body and has two modes, where the alternative was two routes
// for one decision a person makes on one screen.
export const POST = withErrors(
  withAuth(async (request: NextRequest, _context, user) => {
    const raw = await readJsonObject(request, 1024).catch(() => ({}) as Record<string, unknown>);
    const sessionId = typeof raw.sessionId === "string" ? raw.sessionId : null;

    if (sessionId) {
      await staffSessions.revoke(user.id, sessionId);
      return ok({ revoked: 1 });
    }

    // "Sign out everywhere" — the answer to a lost or departing employee's
    // phone. The access token's short (1-day) life is what makes this fast:
    // a revoked session stops refreshing immediately, and the last access
    // token it minted dies on its own within the day.
    const revoked = await staffSessions.revokeAll(user.id);
    return ok({ revoked });
  }),
);
