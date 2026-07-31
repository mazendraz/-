import type { NextRequest } from "next/server";
import { ok } from "@/lib/utils/response";
import { adminOnly } from "@/lib/middleware/guards";
import { updateAdminNotificationSettingsSchema } from "@/lib/validation/settings";
import * as settingsService from "@/lib/services/settings.service";
import * as audit from "@/lib/services/audit.service";

export const dynamic = "force-dynamic";

// Admin read/write for the notification-preferences panel. Own endpoint, not
// folded into /api/admin/settings — this is an operational admin preference,
// not public site config, so it must never ride along in the cached public
// /api/settings payload (same reasoning as /api/admin/maintenance).

// GET /api/admin/notification-settings → ApiAdminNotificationSettings.
export const GET = adminOnly(async () => {
  return ok(await settingsService.getAdminNotificationSettings());
});

// PUT /api/admin/notification-settings → partial update; returns the full set.
export const PUT = adminOnly(async (request: NextRequest, _ctx, user) => {
  const patch = updateAdminNotificationSettingsSchema.parse(await request.json());
  const result = patch.chatEnabled !== undefined
    ? await settingsService.setAdminChatNotifyEnabled(patch.chatEnabled)
    : await settingsService.getAdminNotificationSettings();
  await audit.record(user, {
    action: patch.chatEnabled ? "settings.notifications.chat.enable" : "settings.notifications.chat.disable",
    entity: "AdminNotificationSettings",
    entityId: "admin-notifications",
    meta: { keys: Object.keys(patch) },
  });
  return ok(result);
});
