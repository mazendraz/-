import type { ApiEmailTemplates, ApiLegalPages } from "@alassema/core";
import { apiGet, apiPut } from "@alassema/mobile-shared";

// Genuinely partial-safe PUTs — see lib/adminSettings.ts's header comment
// for why (no Zod `.default()` on either schema).

export function fetchLegalPages(): Promise<ApiLegalPages> {
  return apiGet<ApiLegalPages>("/admin/pages");
}

export function updateLegalPages(patch: Partial<ApiLegalPages>): Promise<ApiLegalPages> {
  return apiPut<ApiLegalPages>("/admin/pages", patch);
}

export function fetchEmailTemplates(): Promise<ApiEmailTemplates> {
  return apiGet<ApiEmailTemplates>("/admin/email-templates");
}

export function updateEmailTemplates(patch: Partial<ApiEmailTemplates>): Promise<ApiEmailTemplates> {
  return apiPut<ApiEmailTemplates>("/admin/email-templates", patch);
}
