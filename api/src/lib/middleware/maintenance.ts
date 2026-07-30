// Maintenance gate for PUBLIC WRITE endpoints.
//
//   export const POST = withErrors(withMaintenance(async (request) => { ... }));
//
// Composes INSIDE withErrors so the thrown MaintenanceError is serialized into the
// standard ApiErrorBody ({ code: "MAINTENANCE" }) with a 503.
//
// ── Why a manual wrapper and not global middleware ────────────────────────────
// There is no global middleware in this project. `src/proxy.ts` (Next 16's name
// for middleware) runs on the Edge runtime and therefore cannot touch Prisma, so
// it cannot read the maintenance flag. Every gated route is wrapped by hand.
//
// The failure mode that matters is NOT "we forgot to exempt something" — it is
// "someone adds a new public write route and forgets to wrap it, so it stays open
// during maintenance and nobody notices". `maintenance.coverage.test.ts` walks
// every route file and fails on exactly that.
//
// ── What is deliberately NOT gated ────────────────────────────────────────────
// • Reads. An admin previewing the live site needs them, and they cause no writes.
// • Anything under admin/ or provider/ — those dashboards stay usable during
//   maintenance (that is the point of taking the public site down).
// • auth/ — an admin has to be able to log in to turn maintenance back off.
import type { NextRequest } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { MaintenanceError } from "@/lib/utils/errors";
import { isMaintenanceEnabled } from "@/lib/services/settings.service";

type Handler<Args extends unknown[]> = (
  ...args: Args
) => Response | Promise<Response>;

/**
 * True when the caller is a signed-in ADMIN. Never throws: on a public endpoint
 * the overwhelmingly common case is "no token at all", which getAuthUser treats
 * as a 401 — here it just means "not an admin", not an error.
 */
async function isAdmin(request: NextRequest): Promise<boolean> {
  try {
    const user = await getAuthUser(request);
    return user.role === "ADMIN";
  } catch {
    return false;
  }
}

/**
 * Reject public writes with 503 MAINTENANCE while maintenance is on.
 * ADMIN sessions pass through so an admin can verify submissions still work
 * before flipping the site back on.
 */
export function withMaintenance<Args extends [NextRequest, ...unknown[]]>(
  handler: Handler<Args>,
): (...args: Args) => Promise<Response> {
  return async (...args: Args): Promise<Response> => {
    // Flag first: the common path is "maintenance off", and that is a single
    // indexed lookup. Only pay for the auth round-trip when the gate is closed.
    if (await isMaintenanceEnabled()) {
      if (!(await isAdmin(args[0]))) {
        throw new MaintenanceError();
      }
    }
    return handler(...args);
  };
}
