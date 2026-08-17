/**
 * Browsing companies — the mobile counterpart of the website's catalog.ts
 * (list-fetching slice only; the profile page, gallery and offerings catalog
 * are a separate, larger piece of work not built yet — see the request
 * screen's own comment on what it deliberately doesn't do).
 */
import type { ApiCompany, ApiPage } from "@alassema/core";
import { apiGet } from "./api";

/** ACTIVE companies only (api's companies.service enforces this server-side). */
export function fetchCompanies(search?: string): Promise<ApiPage<ApiCompany>> {
  const params = new URLSearchParams({ pageSize: "30" });
  if (search?.trim()) params.set("search", search.trim());
  return apiGet<ApiPage<ApiCompany>>(`/companies?${params.toString()}`);
}
