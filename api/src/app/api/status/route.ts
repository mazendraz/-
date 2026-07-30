import { withErrors } from "@/lib/utils/withErrors";
import { ok } from "@/lib/utils/response";
import * as settingsService from "@/lib/services/settings.service";

export const dynamic = "force-dynamic";

// GET /api/status → ApiMaintenanceStatus. The ONE source of truth for maintenance.
//
// `no-store` is the whole point of this route existing separately from
// /api/settings: that one is served with okCached() (max-age=30, s-maxage=60,
// stale-while-revalidate=300), so an admin flipping maintenance on could wait up
// to five minutes for a CDN to notice. Maintenance has to be immediate.
//
// Not a health check — this says nothing about whether the DB is up. That's
// /api/ready (which runs SELECT 1). The frontend uses /api/ready for the
// "offline" screen and this for the "maintenance" screen.
export const GET = withErrors(async () => {
  return ok(await settingsService.getMaintenanceStatus(), 200, {
    "Cache-Control": "no-store, no-cache, must-revalidate",
  });
});
