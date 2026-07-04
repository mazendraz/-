import type { NextRequest } from "next/server";
import { ok } from "@/lib/utils/response";
import { adminOnly } from "@/lib/middleware/guards";
import { updateSettingsSchema } from "@/lib/validation/settings";
import * as settingsService from "@/lib/services/settings.service";
import * as audit from "@/lib/services/audit.service";

export const dynamic = "force-dynamic";

// GET /api/admin/settings → ApiPlatformSettings (same shape as public; for editing).
export const GET = adminOnly(async () => {
  return ok(await settingsService.getPlatformSettings());
});

// PUT /api/admin/settings → partial update; returns the full set.
export const PUT = adminOnly(async (request: NextRequest, _ctx, user) => {
  const patch = updateSettingsSchema.parse(await request.json());
  const result = await settingsService.updatePlatformSettings(patch);
  await audit.record(user, {
    action: "settings.update",
    entity: "PlatformSettings",
    entityId: "platform",
    meta: { keys: Object.keys(patch) },
  });
  return ok(result);
});
