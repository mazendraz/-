import { useEffect, useState } from "react";
import {
  COMPANIES as SEED_COMPANIES,
  SERVICE_CATEGORIES as SEED_CATEGORIES,
  FEATURED_PROJECTS,
  type Company,
  type ServiceCategory,
  type Project,
  type Review,
} from "./data";
import { apiFetch, apiGet, apiPost, apiPut, apiDelete, isApiConfigured } from "./api";
import { getCurrentUser, isAuthenticated } from "./auth";

export type { Company, ServiceCategory, Project, Review };

// Mirrors api/src/lib/validation/companies.ts MAX_CATEGORIES_PER_COMPANY — the
// "no max unless configured" config point. Keep both in sync if it changes.
export const MAX_CATEGORIES_PER_COMPANY = 5;

// ── Storage keys ────────────────────────────────────────────────────────────
const COMPANIES_KEY = "al-assema-companies";
const CATEGORIES_KEY = "al-assema-categories";
const EVENT = "al-assema-catalog-changed";

// ── Low-level read/write ────────────────────────────────────────────────────
function readJSON<T>(key: string, seed: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw) as T;
  } catch {
    /* ignore */
  }
  // In API mode the backend is the source of truth — never seed demo data, or a
  // backend outage would surface fake companies as if they were real. Start
  // empty and let hydration fill the cache; callers show loading/error states.
  if (isApiConfigured()) return (Array.isArray(seed) ? [] : seed) as T;
  // Demo mode: seed on first run so the store is always populated.
  localStorage.setItem(key, JSON.stringify(seed));
  return seed;
}

function writeCompanies(list: Company[]) {
  localStorage.setItem(COMPANIES_KEY, JSON.stringify(list));
  window.dispatchEvent(new CustomEvent(EVENT));
}

function writeCategories(list: ServiceCategory[]) {
  localStorage.setItem(CATEGORIES_KEY, JSON.stringify(list));
  window.dispatchEvent(new CustomEvent(EVENT));
}

function notify() {
  window.dispatchEvent(new CustomEvent(EVENT));
}

// ── Hydration status ─────────────────────────────────────────────────────────
// In API mode the catalog is fetched from the backend. Consumers use this to
// show a loading state on the first (cold-cache) visit and an error state when
// the backend is unreachable and there is nothing cached to fall back to.
export type CatalogStatus = "loading" | "ready" | "error";

function hasCachedCompanies(): boolean {
  try {
    const raw = localStorage.getItem(COMPANIES_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) && arr.length > 0;
  } catch {
    return false;
  }
}

// Demo mode is always "ready". API mode starts "ready" when a warm cache exists
// (we refresh in the background) and "loading" otherwise.
let catalogStatus: CatalogStatus =
  !isApiConfigured() || hasCachedCompanies() ? "ready" : "loading";

export function getCatalogStatus(): CatalogStatus {
  return catalogStatus;
}

function setStatus(s: CatalogStatus) {
  if (s === catalogStatus) return;
  catalogStatus = s;
  window.dispatchEvent(new CustomEvent(EVENT));
}

// ── API hydration + write-through ───────────────────────────────────────────
// When VITE_API_URL is set, the backend is the source of truth for the catalog.
// Reads fill the same localStorage cache the sync getters use (then notify, so the
// reactive hooks re-render). Admins see ALL companies/categories (with ids needed
// to address admin endpoints); the public sees ACTIVE only. Without an API
// configured, the localStorage/seed demo mode below is unchanged.
function isAdminSession(): boolean {
  return (
    isApiConfigured() && isAuthenticated() && getCurrentUser()?.role === "ADMIN"
  );
}

async function fetchCatalog(): Promise<void> {
  const admin = isAdminSession();
  const companiesPath = admin ? "/admin/companies?pageSize=200" : "/companies?pageSize=100";
  const categoriesPath = admin ? "/admin/categories" : "/categories";
  const [companiesPage, categories] = await Promise.all([
    apiFetch<{ data: Company[] }>(companiesPath),
    apiFetch<ServiceCategory[]>(categoriesPath),
  ]);
  localStorage.setItem(COMPANIES_KEY, JSON.stringify(companiesPage.data));
  localStorage.setItem(CATEGORIES_KEY, JSON.stringify(categories));
  setStatus("ready");
  notify();
}

let hydrated = false;

export async function hydrateCatalogFromApi(): Promise<void> {
  if (hydrated || !isApiConfigured()) return;
  hydrated = true;
  if (!hasCachedCompanies()) setStatus("loading");
  try {
    await fetchCatalog();
  } catch (err) {
    hydrated = false; // allow a later retry
    // Keep any stale cache visible; only surface an error when we have nothing.
    setStatus(hasCachedCompanies() ? "ready" : "error");
    console.error("Catalog hydration from API failed:", err);
  }
}

/** Retry a failed cold hydration (used by the error-state retry button). */
export function retryHydration(): void {
  if (!isApiConfigured()) return;
  hydrated = false;
  void hydrateCatalogFromApi();
}

/** Force a re-fetch from the API (used to reconcile after an admin write). */
export async function refreshCatalogFromApi(): Promise<void> {
  if (!isApiConfigured()) return;
  try {
    await fetchCatalog();
  } catch (err) {
    setStatus(hasCachedCompanies() ? "ready" : "error");
    console.error("Catalog refresh from API failed:", err);
  }
}

// Admin categories are cached with their id (ApiAdminCategory); look it up by slug.
function categoryIdForSlug(slug: string): string | null {
  const cat = getCategories().find((c) => c.slug === slug) as
    | (ServiceCategory & { id?: string })
    | undefined;
  return cat?.id ?? null;
}

// Same lookup for a whole selection — drops any slug that no longer resolves
// to a known category (same defensive posture as the single-slug lookup).
function categoryIdsForSlugs(slugs: string[]): string[] {
  return slugs.map(categoryIdForSlug).filter((id): id is string => id !== null);
}

// Map a CompanyDraft/Company to the admin upsert payload (projects replace-all).
function companyPayload(c: CompanyDraft): Record<string, unknown> {
  const primary = c.categories.find((cc) => cc.isPrimary) ?? c.categories[0];
  return {
    categoryIds: categoryIdsForSlugs(c.categories.map((cc) => cc.slug)),
    primaryCategoryId: primary ? categoryIdForSlug(primary.slug) : undefined,
    name: c.name,
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
    featured: c.featured ?? true,
    verified: c.verified ?? false,
    // Manual rating override — the server only applies rating/reviewCount when
    // ratingOverridden is true; otherwise they're derived from real reviews.
    ratingOverridden: c.ratingOverridden ?? false,
    rating: c.rating,
    reviewCount: c.reviewCount,
    metaTitle: c.metaTitle?.trim() || undefined,
    metaDescription: c.metaDescription?.trim() || undefined,
    // Internal contact for lead notifications. Send "" as undefined so an empty
    // field clears the value rather than the API treating it as "leave unchanged".
    email: c.email?.trim() || undefined,
    whatsapp: c.whatsapp?.trim() || undefined,
    projects: c.projects.map((p) => ({
      title: p.title,
      img: p.img,
      description: p.description,
      year: p.year,
      featured: p.featured ?? false,
    })),
    // Already filtered server-side to published + active; the client never has
    // to decide what a visitor may see.
    offerings: c.offerings ?? [],
  };
}

// Kick off hydration as soon as the module loads in the browser.
if (typeof window !== "undefined") {
  void hydrateCatalogFromApi();
}

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : String(Date.now()) + Math.random().toString(16).slice(2);
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

// ── Companies: read ─────────────────────────────────────────────────────────
export function getCompanies(): Company[] {
  return readJSON<Company[]>(COMPANIES_KEY, SEED_COMPANIES);
}

export function getCompany(slug: string): Company | undefined {
  return getCompanies().find((c) => c.slug === slug);
}

export function getCompaniesInCategory(categorySlug: string): Company[] {
  return getCompanies().filter((c) => c.categories.some((cc) => cc.slug === categorySlug));
}

// ── Companies: write ────────────────────────────────────────────────────────
export type CompanyDraft = Omit<Company, "id">;

const EMPTY_COMPANY: CompanyDraft = {
  slug: "",
  name: "",
  tagline: "",
  about: "",
  logo: "",
  cover: "",
  category: "",
  categoryLabel: "",
  categories: [],
  services: [],
  rating: 5,
  reviewCount: 0,
  completedProjects: 0,
  gallery: [],
  projects: [],
  reviews: [],
  phone: "",
  location: "New Administrative Capital",
  yearsExperience: 1,
  responseTime: "within 24 hours",
  verifiedSince: String(new Date().getFullYear()),
  badges: [],
  featured: true,
  verified: false,
  ratingOverridden: false,
  email: "",
  whatsapp: "",
  metaTitle: "",
  metaDescription: "",
};

export function emptyCompany(): CompanyDraft {
  return JSON.parse(JSON.stringify(EMPTY_COMPANY));
}

export async function addCompany(draft: CompanyDraft): Promise<Company> {
  const list = getCompanies();
  const slug = draft.slug || slugify(draft.name);
  const company: Company = { ...draft, id: newId(), slug: uniqueSlug(slug, list) };
  writeCompanies([company, ...list]); // optimistic
  if (isAdminSession()) {
    try {
      await apiPost("/admin/companies", companyPayload(draft));
    } catch (err) {
      // Roll back the optimistic insert and surface the error to the caller —
      // otherwise the new company silently vanishes on the next sync.
      writeCompanies(getCompanies().filter((c) => c.id !== company.id));
      throw err;
    } finally {
      refreshCatalogFromApi();
    }
  }
  return company;
}

function uniqueSlug(base: string, list: Company[]): string {
  let slug = base || "company";
  let n = 2;
  while (list.some((c) => c.slug === slug)) slug = `${base}-${n++}`;
  return slug;
}

export async function updateCompany(id: string, patch: Partial<Company>): Promise<void> {
  writeCompanies(getCompanies().map((c) => (c.id === id ? { ...c, ...patch } : c))); // optimistic
  if (isAdminSession()) {
    // Send the merged company so the payload is always complete (PUT semantics).
    const merged = getCompanies().find((c) => c.id === id);
    if (merged) {
      try {
        await apiPut(`/admin/companies/${id}`, companyPayload(merged));
      } finally {
        // Re-sync from the server on both success and failure so the UI reflects
        // the real stored state (and a rejected save propagates to the caller).
        refreshCatalogFromApi();
      }
    }
  }
}

export function deleteCompany(id: string) {
  writeCompanies(getCompanies().filter((c) => c.id !== id)); // optimistic
  if (isAdminSession()) {
    void apiDelete(`/admin/companies/${id}`)
      .catch((err) => console.error("Delete company failed:", err))
      .finally(() => refreshCatalogFromApi());
  }
}

// ── Per-company projects & reviews ──────────────────────────────────────────
export function addProject(companyId: string, project: Project) {
  writeCompanies(
    getCompanies().map((c) =>
      c.id === companyId ? { ...c, projects: [project, ...c.projects] } : c
    )
  );
}

export function deleteProject(companyId: string, index: number) {
  writeCompanies(
    getCompanies().map((c) =>
      c.id === companyId ? { ...c, projects: c.projects.filter((_, i) => i !== index) } : c
    )
  );
}

export function addReview(companyId: string, review: Review) {
  writeCompanies(
    getCompanies().map((c) => {
      if (c.id !== companyId) return c;
      const reviews = [review, ...c.reviews];
      // Keep aggregate rating/count honest
      const reviewCount = reviews.length;
      const rating = Math.round((reviews.reduce((s, r) => s + r.rating, 0) / reviewCount) * 10) / 10;
      return { ...c, reviews, reviewCount, rating };
    })
  );
}

export function deleteReview(companyId: string, index: number) {
  writeCompanies(
    getCompanies().map((c) => {
      if (c.id !== companyId) return c;
      const reviews = c.reviews.filter((_, i) => i !== index);
      const reviewCount = reviews.length;
      const rating = reviewCount
        ? Math.round((reviews.reduce((s, r) => s + r.rating, 0) / reviewCount) * 10) / 10
        : 0;
      return { ...c, reviews, reviewCount, rating };
    })
  );
}

// ── Categories ──────────────────────────────────────────────────────────────
export function getCategories(): ServiceCategory[] {
  return readJSON<ServiceCategory[]>(CATEGORIES_KEY, SEED_CATEGORIES);
}

export function getCategory(slug: string): ServiceCategory | undefined {
  return getCategories().find((c) => c.slug === slug);
}

/**
 * Category list with live company counts derived from the company store.
 *
 * DEMO MODE ONLY for the recount. In API mode the server already sends a `count`
 * computed over the whole table, and the cached company list is a clamped page
 * (pageSize=200 → 100) — so recounting from it under-reports as soon as the
 * platform passes a hundred companies.
 *
 * The old code was `….length || cat.count`, which also meant a category that had
 * genuinely dropped to ZERO companies fell back through the falsy `0` and kept
 * displaying its previous count forever.
 */
export function getCategoriesWithCounts(): ServiceCategory[] {
  const categories = getCategories();
  if (isApiConfigured()) return categories;
  const companies = getCompanies();
  return categories.map((cat) => ({
    ...cat,
    count: companies.filter((c) => c.categories.some((cc) => cc.slug === cat.slug)).length,
  }));
}

export function addCategory(cat: Omit<ServiceCategory, "count">): ServiceCategory {
  const list = getCategories();
  const slug = cat.slug || slugify(cat.label);
  const created: ServiceCategory = { ...cat, slug, count: 0 };
  writeCategories([...list, created]); // optimistic
  if (isAdminSession()) {
    void apiPost("/admin/categories", {
      label: cat.label,
      description: cat.description,
      icon: cat.icon,
      cover: cat.cover || undefined,
      pricingMode: cat.pricingMode,
      metaTitle: cat.metaTitle?.trim() || undefined,
      metaDescription: cat.metaDescription?.trim() || undefined,
    })
      .catch((err) => console.error("Create category failed:", err))
      .finally(() => refreshCatalogFromApi());
  }
  return created;
}

export function updateCategory(slug: string, patch: Partial<ServiceCategory>) {
  writeCategories(getCategories().map((c) => (c.slug === slug ? { ...c, ...patch } : c))); // optimistic
  if (isAdminSession()) {
    const id = categoryIdForSlug(slug);
    if (id) {
      void apiPut(`/admin/categories/${id}`, {
        label: patch.label,
        description: patch.description,
        icon: patch.icon,
        cover: patch.cover || undefined,
        pricingMode: patch.pricingMode,
        metaTitle: patch.metaTitle?.trim() || undefined,
        metaDescription: patch.metaDescription?.trim() || undefined,
      })
        .catch((err) => console.error("Update category failed:", err))
        .finally(() => refreshCatalogFromApi());
    }
  }
}

/**
 * Deleting a category NEVER deletes a company — a company can belong to
 * several categories, so this only removes that one link. Mirrors
 * categories.service.ts remove(): if any company would be left with zero
 * categories, the delete is refused (thrown before anything is written, same
 * as the API's 409) rather than silently orphaning it.
 */
export async function deleteCategory(slug: string): Promise<void> {
  const orphaned = getCompanies().filter(
    (c) => c.categories.length === 1 && c.categories[0].slug === slug,
  );
  if (orphaned.length > 0) {
    throw new Error(
      `Cannot delete category: ${orphaned.length} compan${orphaned.length === 1 ? "y" : "ies"} ` +
        `would be left with no category (${orphaned.map((c) => c.name).join(", ")}). Reassign them first.`,
    );
  }

  const id = isAdminSession() ? categoryIdForSlug(slug) : null;
  writeCategories(getCategories().filter((c) => c.slug !== slug)); // optimistic
  // Every affected company just loses this one link; promote another category
  // to primary if this was it (the orphan check above guarantees one remains).
  writeCompanies(
    getCompanies().map((c) => {
      if (!c.categories.some((cc) => cc.slug === slug)) return c;
      const wasPrimary = c.categories.find((cc) => cc.slug === slug)?.isPrimary ?? false;
      const rest = c.categories.filter((cc) => cc.slug !== slug);
      if (wasPrimary && rest.length > 0) rest[0] = { ...rest[0], isPrimary: true };
      const primary = rest.find((cc) => cc.isPrimary) ?? rest[0];
      return { ...c, categories: rest, category: primary?.slug ?? "", categoryLabel: primary?.label ?? "" };
    }),
  );
  if (id) {
    // The API applies the same orphan check server-side; a rejection here
    // propagates to the caller and the re-sync restores the optimistic rows.
    try {
      await apiDelete(`/admin/categories/${id}`);
    } finally {
      refreshCatalogFromApi();
    }
  }
}

// ── Reset / export / import ─────────────────────────────────────────────────
export function resetCatalog() {
  localStorage.setItem(COMPANIES_KEY, JSON.stringify(SEED_COMPANIES));
  localStorage.setItem(CATEGORIES_KEY, JSON.stringify(SEED_CATEGORIES));
  notify();
}

export function exportCatalog(): string {
  return JSON.stringify(
    { companies: getCompanies(), categories: getCategories() },
    null,
    2
  );
}

export function importCatalog(json: string): boolean {
  try {
    const data = JSON.parse(json);
    if (Array.isArray(data.companies)) localStorage.setItem(COMPANIES_KEY, JSON.stringify(data.companies));
    if (Array.isArray(data.categories)) localStorage.setItem(CATEGORIES_KEY, JSON.stringify(data.categories));
    notify();
    return true;
  } catch {
    return false;
  }
}

// ── Reactive hooks ──────────────────────────────────────────────────────────
function useCatalogValue<T>(getter: () => T): T {
  const [value, setValue] = useState<T>(getter);
  useEffect(() => {
    const refresh = () => setValue(getter());
    window.addEventListener(EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return value;
}

export function useCompanies(): Company[] {
  return useCatalogValue(getCompanies);
}

export function useCategories(): ServiceCategory[] {
  return useCatalogValue(getCategories);
}

export function useCategoriesWithCounts(): ServiceCategory[] {
  return useCatalogValue(getCategoriesWithCounts);
}

export function useCompany(slug: string): Company | undefined {
  const companies = useCompanies();
  return companies.find((c) => c.slug === slug);
}

/**
 * Full company for a detail view (profile / provider dashboard). The public list
 * endpoint now returns lightweight cards WITHOUT projects/reviews, so a page that
 * needs those must fetch the full record by slug. The cached card paints instantly
 * (name/cover/rating); the fetched detail (full projects/reviews) replaces it when
 * it lands. In demo mode (no API) the cache already holds full seed data, so it's
 * used directly. `loading` is true only while fetching with nothing yet to show.
 */
export function useCompanyDetail(slug: string): { company: Company | undefined; loading: boolean } {
  const cached = useCompany(slug);
  const [detail, setDetail] = useState<Company | undefined>(undefined);
  const [loading, setLoading] = useState<boolean>(isApiConfigured() && Boolean(slug));

  useEffect(() => {
    if (!isApiConfigured() || !slug) {
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    setDetail(undefined);
    apiGet<Company>(`/companies/${encodeURIComponent(slug)}`)
      .then((full) => { if (active) setDetail(full); })
      .catch(() => { /* keep the cached card as a fallback */ })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [slug]);

  const company = !isApiConfigured() ? cached : (detail ?? cached);
  return { company, loading: loading && !company };
}

/** Reactive hydration status (loading/ready/error) for loading & error UI. */
export function useCatalogStatus(): CatalogStatus {
  return useCatalogValue(getCatalogStatus);
}

/**
 * The signed-in provider's OWN company, from /provider/profile.
 *
 * NOT the public catalog, and that distinction is the whole point. The public
 * list is ACTIVE-only and capped at 100 rows (companies.service MAX_PAGE_SIZE),
 * so resolving a provider's own company by searching it locked out anyone whose
 * company was INACTIVE/SUSPENDED, or — once the platform passes 100 active
 * companies — anyone ranked past the cap. They landed on the "no company" screen
 * with no way to reach their leads, messages or availability at all.
 *
 * /provider/profile is scoped to their own companyId server-side and carries
 * neither restriction.
 *
 * Demo mode (no API, so no session) has no such endpoint; callers fall back to
 * the local catalog there.
 */
export function useMyCompany(): {
  company: Company | undefined;
  loading: boolean;
  error: boolean;
} {
  const apiMode = isApiConfigured();
  const [state, setState] = useState<{
    company?: Company;
    loading: boolean;
    error: boolean;
  }>({ loading: apiMode, error: false });

  useEffect(() => {
    if (!apiMode) {
      setState({ loading: false, error: false });
      return;
    }
    let alive = true;
    const load = () => {
      apiGet<{ company: Company }>("/provider/profile")
        .then((res) => {
          if (alive) setState({ company: res.company, loading: false, error: false });
        })
        .catch(() => {
          if (alive) setState((s) => ({ ...s, loading: false, error: true }));
        });
    };
    load();
    // Availability saves and approved change requests both call
    // refreshCatalogFromApi(), which fires EVENT. Re-read on it so this copy
    // can't sit stale behind a write the provider just made.
    window.addEventListener(EVENT, load);
    return () => {
      alive = false;
      window.removeEventListener(EVENT, load);
    };
  }, [apiMode]);

  return { company: state.company, loading: state.loading, error: state.error };
}

export interface FeaturedProject {
  title: string;
  img: string;
  company: string;
  category: string;
}

/**
 * Homepage "Featured Projects" showcase. In API mode, the admin-curated featured
 * projects (Project.featured) of ACTIVE companies; falls back to the seed list
 * when none are flagged or the API is unavailable, so the section never looks empty.
 */
export function useFeaturedProjects(): FeaturedProject[] {
  const [list, setList] = useState<FeaturedProject[]>(FEATURED_PROJECTS);
  useEffect(() => {
    if (!isApiConfigured()) return;
    let active = true;
    apiGet<FeaturedProject[]>("/projects/featured")
      .then((rows) => { if (active && rows.length > 0) setList(rows); })
      .catch(() => { /* keep the seed fallback */ });
    return () => { active = false; };
  }, []);
  return list;
}
