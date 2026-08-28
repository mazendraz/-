// Shared-secret auth for cron-triggered routes (currently just
// /api/cron/notifications-sweep, but written generically since a second
// scheduled route is a realistic next addition). Pulled out of the route
// file so the auth decision — not just the DB-hitting sweeps behind it — has
// its own direct test coverage.
import { safeEqual } from "@/lib/utils/token";

/**
 * True only when a secret is actually configured AND the caller presented
 * the exact same value (timing-safe compare). An unset CRON_SECRET refuses
 * every request — there is no "auth disabled" mode, since this route can
 * SEND things (unlike a route that just needs default-deny on missing
 * config for its own safety).
 */
export function isValidCronSecret(provided: string | null, configured: string | undefined): boolean {
  if (!configured) return false;
  return safeEqual(provided ?? "", configured);
}
