import { useEffect, useState } from "react";
import {
  COMPANIES as SEED_COMPANIES,
  SERVICE_CATEGORIES as SEED_CATEGORIES,
  type Company,
  type ServiceCategory,
  type Project,
  type Review,
} from "./data";

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
  // Seed on first run so the store is always populated
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
  writeCompanies([company, ...list]);
  return company;
}

function uniqueSlug(base: string, list: Company[]): string {
  let slug = base || "company";
  let n = 2;
  while (list.some((c) => c.slug === slug)) slug = `${base}-${n++}`;
  return slug;
}

export function updateCompany(id: string, patch: Partial<Company>) {
  writeCompanies(getCompanies().map((c) => (c.id === id ? { ...c, ...patch } : c)));
}

export function deleteCompany(id: string) {
  writeCompanies(getCompanies().filter((c) => c.id !== id));
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
  writeCategories([...list, created]);
  return created;
}

export function updateCategory(slug: string, patch: Partial<ServiceCategory>) {
  writeCategories(getCategories().map((c) => (c.slug === slug ? { ...c, ...patch } : c)));
}

export function deleteCategory(slug: string) {
  writeCategories(getCategories().filter((c) => c.slug !== slug));
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
