import type { ApiAdminNotificationSettings, ApiMaintenanceStatus, ApiPlatformSettings } from "@alassema/core";
import { apiGet, apiPut } from "@alassema/mobile-shared";

/**
 * All five PUT routes below are GENUINE partial updates — each schema
 * (validation/settings.ts) is hand-written with plain `.optional()` fields
 * and no Zod `.default(...)` anywhere, so `.partial()`'s "still applies a
 * default when a field is omitted" hazard (found and fixed in phase 10 for
 * companies/categories) doesn't apply here. Sending just the one changed
 * field is safe and correct — these screens don't need to round-trip the
 * full record on every save the way CompanyForm/CategoryForm do.
 */

export function fetchPlatformSettings(): Promise<ApiPlatformSettings> {
  return apiGet<ApiPlatformSettings>("/admin/settings");
}

export function updatePlatformSettings(patch: Partial<ApiPlatformSettings>): Promise<ApiPlatformSettings> {
  return apiPut<ApiPlatformSettings>("/admin/settings", patch);
}

export function fetchMaintenanceStatus(): Promise<ApiMaintenanceStatus> {
  return apiGet<ApiMaintenanceStatus>("/admin/maintenance");
}

export function updateMaintenanceStatus(patch: Partial<ApiMaintenanceStatus>): Promise<ApiMaintenanceStatus> {
  return apiPut<ApiMaintenanceStatus>("/admin/maintenance", patch);
}

export function fetchAdminNotificationSettings(): Promise<ApiAdminNotificationSettings> {
  return apiGet<ApiAdminNotificationSettings>("/admin/notification-settings");
}

export function setAdminChatNotifyEnabled(chatEnabled: boolean): Promise<ApiAdminNotificationSettings> {
  return apiPut<ApiAdminNotificationSettings>("/admin/notification-settings", { chatEnabled });
}
