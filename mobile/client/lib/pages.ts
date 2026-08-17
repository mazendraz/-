import type { ApiLegalPages, ApiPlatformSettings } from "@alassema/core";
import { apiGet } from "./api";

/** Terms + Privacy content — admin-managed HTML/text, rendered as-is. */
export function fetchLegalPages(): Promise<ApiLegalPages> {
  return apiGet<ApiLegalPages>("/pages");
}

/** Site-wide settings: contact details, socials, branding. Public. */
export function fetchPlatformSettings(): Promise<ApiPlatformSettings> {
  return apiGet<ApiPlatformSettings>("/settings");
}
