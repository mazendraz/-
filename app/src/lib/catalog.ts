import { useEffect, useState } from "react";
import {
  COMPANIES as SEED_COMPANIES,
  SERVICE_CATEGORIES as SEED_CATEGORIES,
  type Company,
  type ServiceCategory,
  type Project,
  type Review,
} from "./data";
import { apiFetch, apiPost, apiPut, apiDelete, isApiConfigured } from "./api";
import { getCurrentUser, isAuthenticated } from "./auth";

export type { Company, ServiceCategory, Project, Review };

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

// Map a CompanyDraft/Company to the admin upsert payload (projects replace-all).
function companyPayload(c: CompanyDraft): Record<string, unknown> {
  return {
    categoryId: categoryIdForSlug(c.category),
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
    projects: c.projects.map((p) => ({
      title: p.title,
      img: p.img,
      description: p.description,
      year: p.year,
    })),
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
  return getCompanies().filter((c) => c.category === categorySlug);
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
};

export function emptyCompany(): CompanyDraft {
  return JSON.parse(JSON.stringify(EMPTY_COMPANY));
}

export function addCompany(draft: CompanyDraft): Company {
  const list = getCompanies();
  const slug = draft.slug || slugify(draft.name);
  const company: Company = { ...draft, id: newId(), slug: uniqueSlug(slug, list) };
  writeCompanies([company, ...list]); // optimistic
  if (isAdminSession()) {
    void apiPost("/admin/companies", companyPayload(draft))
      .catch((err) => console.error("Create company failed:", err))
      .finally(() => refreshCatalogFromApi());
  }
  return company;
}

function uniqueSlug(base: string, list: Company[]): string {
  let slug = base || "company";
  let n = 2;
  while (list.some((c) => c.slug === slug)) slug = `${base}-${n++}`;
  return slug;
}

export function updateCompany(id: string, patch: Partial<Company>) {
  writeCompanies(getCompanies().map((c) => (c.id === id ? { ...c, ...patch } : c))); // optimistic
  if (isAdminSession()) {
    // Send the merged company so the payload is always complete (PUT semantics).
    const merged = getCompanies().find((c) => c.id === id);
    if (merged) {
      void apiPut(`/admin/companies/${id}`, companyPayload(merged))
        .catch((err) => console.error("Update company failed:", err))
        .finally(() => refreshCatalogFromApi());
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

/** Category list with live company counts derived from the company store. */
export function getCategoriesWithCounts(): ServiceCategory[] {
  const companies = getCompanies();
  return getCategories().map((cat) => ({
    ...cat,
    count: companies.filter((c) => c.category === cat.slug).length || cat.count,
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
      })
        .catch((err) => console.error("Update category failed:", err))
        .finally(() => refreshCatalogFromApi());
    }
  }
}

export function deleteCategory(slug: string) {
  const id = isAdminSession() ? categoryIdForSlug(slug) : null;
  writeCategories(getCategories().filter((c) => c.slug !== slug)); // optimistic
  if (id) {
    // DELETE fails with 409 if the category still has companies — refresh then
    // restores it (the delete simply didn't take).
    void apiDelete(`/admin/categories/${id}`)
      .catch((err) => console.error("Delete category failed:", err))
      .finally(() => refreshCatalogFromApi());
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

/** Reactive hydration status (loading/ready/error) for loading & error UI. */
export function useCatalogStatus(): CatalogStatus {
  return useCatalogValue(getCatalogStatus);
}
