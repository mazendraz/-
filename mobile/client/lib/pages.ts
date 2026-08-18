import type { ApiLegalPages, ApiMaintenanceStatus, ApiPlatformSettings } from "@alassema/core";
import { apiGet } from "./api";

/** Terms + Privacy content — admin-managed HTML/text, rendered as-is. */
export function fetchLegalPages(): Promise<ApiLegalPages> {
  return apiGet<ApiLegalPages>("/pages");
}

/** Site-wide settings: contact details, socials, branding. Public. */
export function fetchPlatformSettings(): Promise<ApiPlatformSettings> {
  return apiGet<ApiPlatformSettings>("/settings");
}

/** Public: current maintenance state. `no-store` on the server (see
 *  useMaintenance's comment in lib/settings.ts for why this is a separate
 *  endpoint from /settings, not folded into ApiPlatformSettings). */
export function fetchMaintenance(): Promise<ApiMaintenanceStatus> {
  return apiGet<ApiMaintenanceStatus>("/status");
}
