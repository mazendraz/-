import type { ApiLegalPages } from "@alassema/core";
import { apiGet } from "@alassema/mobile-shared";

/** Terms + Privacy content — admin-managed HTML/text, rendered as-is. */
export function fetchLegalPages(): Promise<ApiLegalPages> {
  return apiGet<ApiLegalPages>("/pages");
}

// Maintenance state moved to @alassema/mobile-shared's maintenance.ts (phase
// 2 of the mobile plan); platform settings (fetchPlatformSettings,
// useSettings) moved to @alassema/mobile-shared's settings.ts (phase 13/14
// branding work) — same reasoning both times: /status and /settings are
// public and role-agnostic, and the Business App needs the identical fetch
// + caching logic this app already had.
