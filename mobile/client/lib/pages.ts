import type { ApiLegalPages, ApiPlatformSettings } from "@alassema/core";
import { apiGet } from "@alassema/mobile-shared";

/** Terms + Privacy content — admin-managed HTML/text, rendered as-is. */
export function fetchLegalPages(): Promise<ApiLegalPages> {
  return apiGet<ApiLegalPages>("/pages");
}

/** Site-wide settings: contact details, socials, branding. Public. */
export function fetchPlatformSettings(): Promise<ApiPlatformSettings> {
  return apiGet<ApiPlatformSettings>("/settings");
}

// Maintenance state moved to @alassema/mobile-shared's maintenance.ts (phase
// 2 of the mobile plan) — /status is public and role-agnostic, and the
// Business App needs the identical fetch + gating logic this app already had.
