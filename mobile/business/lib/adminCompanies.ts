/**
 * Company directory (phase 8, read) plus full admin CRUD over a company and
 * its sub-resources (phase 10): status, availability, busy windows,
 * offerings written directly (no change-request gate — see phase-10's own
 * "asymmetry with phase 7" note), projects, reviews, and its waitlist.
 */
import type { ApiAvailabilityPayload, ApiCompany, ApiOffering, ApiPage, ApiProject, ApiReview, ApiWaitlistEntry, ApiWaitlistStatus } from "@alassema/core";
import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from "@alassema/mobile-shared";
import type { ApiBusyWindow, BusyWindowInput } from "./availability";
import type { OfferingInput as ProviderOfferingInput } from "./offerings";

export type CompanyStatusValue = "ACTIVE" | "INACTIVE" | "SUSPENDED";

/** Mirrors api's validation/companies.ts MAX_CATEGORIES_PER_COMPANY exactly
 *  — not part of @alassema/core (a server validation constant, not a
 *  contract type), same reasoning as this file's other server-internal
 *  mirrors. */
export const MAX_CATEGORIES_PER_COMPANY = 5;

export interface AdminCompanyListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: CompanyStatusValue;
}

/**
 * GET /admin/companies. Note `status` narrows results server-side but
 * `ApiCompany` doesn't serialize a `status` field back — see phase-8's own
 * doc correction — so a matched row can't show which status it matched on.
 *
 * This is ALSO the only read for one company's full detail (name, gallery,
 * projects, reviews, offerings, contact fields — everything) — there is no
 * `GET /admin/companies/[id]`, confirmed against the actual route file (it
 * exports only PUT/DELETE). `fetchCompanyDetail` below fetches a page and
 * finds the row by id, same "list is the only read" pattern already used
 * for offerings/projects/reviews/feedback in earlier phases. The admin
 * list's own Prisma query eagerly loads the full relations for every row
 * (companyInclude, same as create/update), so this isn't a degraded read —
 * it genuinely has everything. The real limit is scale: at pageSize's 100-
 * row ceiling, a platform past ~100 companies would need a real
 * GET-by-id route; not worth adding pre-emptively for a company count that
 * is nowhere near that yet.
 */
export function fetchAdminCompanies(query: AdminCompanyListQuery = {}): Promise<ApiPage<ApiCompany>> {
  const params = new URLSearchParams();
  if (query.page) params.set("page", String(query.page));
  if (query.pageSize) params.set("pageSize", String(query.pageSize));
  if (query.search) params.set("search", query.search);
  if (query.status) params.set("status", query.status);
  const qs = params.toString();
  return apiGet<ApiPage<ApiCompany>>(`/admin/companies${qs ? `?${qs}` : ""}`);
}

export async function fetchCompanyDetail(id: string): Promise<ApiCompany | null> {
  const page = await fetchAdminCompanies({ pageSize: 100 });
  return page.data.find((c) => c.id === id) ?? null;
}

/**
 * The full-representation input every editable field on `upsertCompanySchema`
 * accepts. `PUT /admin/companies/[id]` is NOT a patch — see phase-10's own
 * biggest risk note: sending a partial body blanks every field left out.
 * The editor must always build this from the freshly-fetched ApiCompany,
 * never from form state alone.
 */
export interface CompanyInput {
  categoryIds: string[];
  primaryCategoryId?: string;
  name: string;
  nameAr?: string | null;
  tagline: string;
  about: string;
  logo: string;
  cover: string;
  services: string[];
  gallery: string[];
  badges: string[];
  phone: string;
  location: string;
  yearsExperience: number;
  responseTime: string;
  verifiedSince: string;
  completedProjects?: number;
  featured?: boolean;
  verified?: boolean;
  rating?: number;
  reviewCount?: number;
  ratingOverridden?: boolean;
  metaTitle?: string | null;
  metaDescription?: string | null;
  email?: string | null;
  whatsapp?: string | null;
}

/**
 * Builds a complete CompanyInput from an already-fetched ApiCompany, so a
 * caller can PUT back exactly what it has plus its own edits — the one
 * correct way to avoid phase-10's "PUT blanks fields" risk.
 *
 * `categoryIds` needs a slug→id lookup: `ApiCompany.categories` only ever
 * carries `{slug, label, pricingMode, isPrimary}` (no id — it's a public-
 * profile-shaped field, reused as-is on the admin payload), while
 * `upsertCompanySchema.categoryIds` requires real category ids. Build
 * `categoryIdBySlug` from `fetchAdminCategories()` (the editor needs that
 * list anyway, for the category picker) and pass it in here.
 */
export function companyToInput(c: ApiCompany, categoryIdBySlug: ReadonlyMap<string, string>): CompanyInput {
  const categoryIds = c.categories.map((cat) => categoryIdBySlug.get(cat.slug)).filter((id): id is string => Boolean(id));
  const primary = c.categories.find((cat) => cat.isPrimary);
  return {
    categoryIds,
    primaryCategoryId: primary ? categoryIdBySlug.get(primary.slug) : undefined,
    name: c.name,
    nameAr: c.nameAr ?? null,
    tagline: c.tagline,
    about: c.about,
    logo: c.logo,
    cover: c.cover,
    services: c.services,
    gallery: c.gallery,
    badges: c.badges,
    phone: c.phone,
    location: c.location,
    yearsExperience: c.yearsExperience,
    responseTime: c.responseTime,
    verifiedSince: c.verifiedSince,
    completedProjects: c.completedProjects,
    featured: c.featured,
    verified: c.verified,
    rating: c.rating,
    reviewCount: c.reviewCount,
    ratingOverridden: c.ratingOverridden,
    metaTitle: c.metaTitle ?? null,
    metaDescription: c.metaDescription ?? null,
    email: c.email ?? null,
    whatsapp: c.whatsapp ?? null,
  };
}

/**
 * `CompanyInput`'s nullable fields (nameAr/email/whatsapp/metaTitle/
 * metaDescription) mirror `ApiCompany`'s own `T | null` shape — the natural
 * type for "this optional field has genuinely been read back as unset".
 * `upsertCompanySchema`/`updateCompanySchema` disagree: those fields are
 * `.optional()` only (`T | undefined`), never `.nullable()`, so a literal
 * `null` 400s ("expected string, received null") — found live, the very
 * first create/update attempt. Rather than push `null`-vs-`undefined`
 * bookkeeping onto CompanyForm (which needs SOME value to display in a
 * controlled TextInput either way), this converts at the one place every
 * write passes through.
 */
function toWireBody(input: CompanyInput): Record<string, unknown> {
  const { nameAr, email, whatsapp, metaTitle, metaDescription, ...rest } = input;
  return {
    ...rest,
    nameAr: nameAr ?? undefined,
    email: email ?? undefined,
    whatsapp: whatsapp ?? undefined,
    metaTitle: metaTitle ?? undefined,
    metaDescription: metaDescription ?? undefined,
  };
}

/** POST /admin/companies — create. */
export function createCompany(input: CompanyInput): Promise<ApiCompany> {
  return apiPost<ApiCompany>("/admin/companies", toWireBody(input));
}

/** PUT /admin/companies/[id] — full replace. See CompanyInput's own comment. */
export function updateCompany(id: string, input: CompanyInput): Promise<ApiCompany> {
  return apiPut<ApiCompany>(`/admin/companies/${id}`, toWireBody(input));
}

/** DELETE /admin/companies/[id] — cascades projects/reviews/leads. */
export function deleteCompany(id: string): Promise<void> {
  return apiDelete<void>(`/admin/companies/${id}`);
}

export function setCompanyStatus(id: string, status: CompanyStatusValue): Promise<ApiCompany> {
  return apiPatch<ApiCompany>(`/admin/companies/${id}/status`, { status });
}

/** PATCH /admin/companies/[id]/availability. No GET counterpart exists
 *  (confirmed against the route file — PATCH only) — current state comes
 *  from the company detail's own busy/busyUntil/busyNote fields, same
 *  pattern as the provider's own availability screen. */
export function setCompanyAvailability(id: string, payload: ApiAvailabilityPayload): Promise<ApiCompany> {
  return apiPatch<ApiCompany>(`/admin/companies/${id}/availability`, payload);
}

export function fetchCompanyBusyWindows(companyId: string): Promise<ApiBusyWindow[]> {
  return apiGet<ApiBusyWindow[]>(`/admin/companies/${companyId}/busy-windows`);
}

export function createCompanyBusyWindow(companyId: string, input: BusyWindowInput): Promise<ApiBusyWindow> {
  return apiPost<ApiBusyWindow>(`/admin/companies/${companyId}/busy-windows`, input);
}

export function deleteCompanyBusyWindow(companyId: string, windowId: string): Promise<void> {
  return apiDelete<void>(`/admin/companies/${companyId}/busy-windows/${windowId}`);
}

// ── Offerings — direct write, no review (see phase-10's "asymmetry with
// phase 7" note) ─────────────────────────────────────────────────────────

export function fetchCompanyOfferings(companyId: string): Promise<ApiOffering[]> {
  return apiGet<ApiOffering[]>(`/admin/companies/${companyId}/offerings`);
}

/** POST — always published immediately; an admin's own write needs no
 *  review. 409s with a clear catalog-disabled message if the company's
 *  category is QUOTE_ONLY (assertCatalogEnabled, server-side). */
export function createCompanyOffering(companyId: string, input: ProviderOfferingInput): Promise<ApiOffering> {
  return apiPost<ApiOffering>(`/admin/companies/${companyId}/offerings`, input);
}

/** PATCH — a partial patch is fine here (unlike the company PUT): the
 *  server merges it over the current row itself (see the route's own
 *  comment on why, distinct from adminUpsert's create path). */
export function updateCompanyOffering(companyId: string, offeringId: string, patch: Partial<ProviderOfferingInput>): Promise<ApiOffering> {
  return apiPatch<ApiOffering>(`/admin/companies/${companyId}/offerings/${offeringId}`, patch);
}

export function deleteCompanyOffering(companyId: string, offeringId: string): Promise<void> {
  return apiDelete<void>(`/admin/companies/${companyId}/offerings/${offeringId}`);
}

export function setCompanyOfferingVisibility(companyId: string, offeringId: string, patch: { isActive?: boolean; sortOrder?: number }): Promise<ApiOffering> {
  return apiPatch<ApiOffering>(`/admin/companies/${companyId}/offerings/${offeringId}/visibility`, patch);
}

/** No tier route exists on the admin side at all (confirmed — only
 *  list/create/patch/delete/visibility on the offering itself). Tiers stay
 *  provider-only, change-request-gated (phase 7/9); the admin editor can
 *  only display them, reusing TierRow read-only. */

interface PriceReference {
  available: boolean;
  reason?: "not_per_unit" | "insufficient_data";
  unit?: string;
  sampleSize?: number;
  min?: number;
  median?: number;
  max?: number;
}

/** GET /admin/offerings/[id]/reference — advisory only, never a constraint
 *  (see the route's own comment: the provider sets the price; approval is
 *  the control, not this number). */
export function fetchOfferingReference(offeringId: string): Promise<{ reference: PriceReference; outlier: boolean }> {
  return apiGet<{ reference: PriceReference; outlier: boolean }>(`/admin/offerings/${offeringId}/reference`);
}

// ── Projects — add on the company's behalf; delete is the shared
// /admin/projects/[id] route already in lib/approvals.ts ──────────────────

/** GET /admin/companies/[id]/projects — projects WITH `id` and `status`.
 *  NOT the same as the `projects` array on the company detail payload, which is
 *  serialized publicly and has no `id`: rendering that list gave every row
 *  `key={undefined}` and a delete button that posted an undefined id. */
export function fetchCompanyProjects(companyId: string): Promise<ApiProject[]> {
  return apiGet<ApiProject[]>(`/admin/companies/${companyId}/projects`);
}

export function addCompanyProject(companyId: string, input: { title: string; img: string; description: string; year: string; sortOrder?: number }): Promise<ApiProject> {
  return apiPost<ApiProject>(`/admin/companies/${companyId}/projects`, input);
}

// ── Reviews — add on the company's behalf; delete is this company-scoped
// route, distinct from the platform-wide moderation delete in lib/approvals.ts ──

export function addCompanyReview(companyId: string, input: { author: string; avatar?: string; rating: number; text: string; date: string; district: string }): Promise<ApiReview> {
  return apiPost<ApiReview>(`/admin/companies/${companyId}/reviews`, input);
}

export function deleteCompanyReview(companyId: string, reviewId: string): Promise<void> {
  return apiDelete<void>(`/admin/companies/${companyId}/reviews/${reviewId}`);
}

// ── Waitlist ──────────────────────────────────────────────────────────────

export function fetchCompanyWaitlist(companyId: string, query: { page?: number; pageSize?: number; status?: ApiWaitlistStatus } = {}): Promise<ApiPage<ApiWaitlistEntry>> {
  const params = new URLSearchParams();
  if (query.page) params.set("page", String(query.page));
  if (query.pageSize) params.set("pageSize", String(query.pageSize));
  if (query.status) params.set("status", query.status);
  const qs = params.toString();
  return apiGet<ApiPage<ApiWaitlistEntry>>(`/admin/companies/${companyId}/waitlist${qs ? `?${qs}` : ""}`);
}

export function setCompanyWaitlistStatus(companyId: string, entryId: string, status: ApiWaitlistStatus): Promise<ApiWaitlistEntry> {
  return apiPatch<ApiWaitlistEntry>(`/admin/companies/${companyId}/waitlist/${entryId}`, { status });
}

export function deleteCompanyWaitlistEntry(companyId: string, entryId: string): Promise<void> {
  return apiDelete<void>(`/admin/companies/${companyId}/waitlist/${entryId}`);
}
