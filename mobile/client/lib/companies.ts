/**
 * Browsing companies — the mobile counterpart of the website's catalog.ts
 * (list-fetching slice only; the profile page, gallery and offerings catalog
 * are a separate, larger piece of work not built yet — see the request
 * screen's own comment on what it deliberately doesn't do).
 */
import type { ApiCompany, ApiPage } from "@alassema/core";
import { apiGet } from "./api";

/** Matches the website's SORTS in Companies.tsx — same query param, same values. */
export type CompanySort = "recommended" | "rating" | "projects" | "reviews" | "name";

/** ACTIVE companies only (api's companies.service enforces this server-side).
 *  category/minRating/sort are forwarded straight to the server (parseCompanyListQuery)
 *  — no client-side filtering/sorting here, same contract the website's catalog.ts uses. */
export function fetchCompanies(
  search?: string,
  opts?: { category?: string; minRating?: number; sort?: CompanySort; page?: number; pageSize?: number },
): Promise<ApiPage<ApiCompany>> {
  const params = new URLSearchParams({ pageSize: String(opts?.pageSize ?? 30) });
  if (search?.trim()) params.set("search", search.trim());
  if (opts?.category) params.set("category", opts.category);
  if (opts?.minRating) params.set("minRating", String(opts.minRating));
  if (opts?.sort) params.set("sort", opts.sort);
  if (opts?.page) params.set("page", String(opts.page));
  return apiGet<ApiPage<ApiCompany>>(`/companies?${params.toString()}`);
}
