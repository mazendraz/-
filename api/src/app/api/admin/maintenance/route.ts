import type { NextRequest } from "next/server";
import { ok } from "@/lib/utils/response";
import { adminOnly } from "@/lib/middleware/guards";
import { updateMaintenanceSchema } from "@/lib/validation/settings";
import * as settingsService from "@/lib/services/settings.service";
import * as audit from "@/lib/services/audit.service";

export const dynamic = "force-dynamic";

// Admin read/write for the maintenance screen. Its own endpoint rather than extra
// keys on /api/admin/settings — same reason ApiEmailTemplates and ApiLegalPages
// have their own: they are admin-editable config that must NOT ride along in the
// cached public /api/settings payload.

// GET /api/admin/maintenance → ApiMaintenanceStatus (same shape as public /status).
export const GET = adminOnly(async () => {
  return ok(await settingsService.getMaintenanceStatus());
});

// PUT /api/admin/maintenance → partial update; returns the full status.
export const PUT = adminOnly(async (request: NextRequest, _ctx, user) => {
  const patch = updateMaintenanceSchema.parse(await request.json());
  const result = await settingsService.updateMaintenanceStatus(patch);
  // Taking the site down (or bringing it back) is a high-blast-radius action —
  // always leave a trail of who flipped it and when.
  await audit.record(user, {
    action: patch.enabled === undefined
      ? "maintenance.update"
      : patch.enabled ? "maintenance.enable" : "maintenance.disable",
    entity: "Maintenance",
    entityId: "maintenance",
    meta: { keys: Object.keys(patch) },
  });
  return ok(result);
});
