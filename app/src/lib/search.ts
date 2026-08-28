import { getCompanies, getCategoriesWithCounts, type Company } from "./catalog";
import { apiGet, isApiConfigured } from "./api";
import type { ApiCatalogSearchResponse, ApiCatalogSearchResult } from "./apiTypes";

export type SearchResult =
  | { type: "category"; slug: string; label: string; sub: string; icon: string; to: string }
  | { type: "company"; slug: string; label: string; sub: string; image: string; to: string }
  | { type: "product" | "service"; label: string; sub: string; image: string; to: string; companySlug: string };

const POPULAR = [
  "Interior Design",
  "Smart Home",
  "Landscape",
  "Kitchen Finishing",
  "Furniture",
];

export function getPopularSearches(): string[] {
  return POPULAR;
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي");
}

function bigrams(s: string): Set<string> {
  const set = new Set<string>();
  for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
  return set;
}

function bigramSim(a: string, b: string): number {
  const bg1 = bigrams(a);
  const bg2 = bigrams(b);
  if (!bg1.size || !bg2.size) return 0;
  let shared = 0;
  bg1.forEach((g) => { if (bg2.has(g)) shared++; });
  return (2 * shared) / (bg1.size + bg2.size);
}

/** Returns true if `text` contains or fuzzy-matches the pre-normalised query `normQ`. */
function matchesQuery(text: string, normQ: string): boolean {
  const nt = norm(text);
  if (nt.includes(normQ)) return true;
  const tokens = normQ.split(/\s+/).filter(Boolean);
  if (tokens.length > 1 && tokens.every((t) => nt.includes(t))) return true;
  if (tokens.length === 1 && bigramSim(nt, normQ) > 0.4) return true;
  return false;
}

// Category matches (fully loaded in the catalog, so always client-side).
function categoryResults(q: string): SearchResult[] {
  const out: SearchResult[] = [];
  for (const cat of getCategoriesWithCounts()) {
    if (matchesQuery(cat.label, q) || matchesQuery(cat.description, q)) {
      out.push({
        type: "category",
        slug: cat.slug,
        label: cat.label,
        sub: `${cat.count} companies`,
        icon: cat.icon,
        to: `/services/${cat.slug}`,
      });
    }
  }
  return out;
}

// Company matches from a set of companies (no per-service-string results any
// more — real products/services come from the unified /search endpoint's
// Offering-backed "product"/"service" results instead, see searchRemote).
function companyResults(companies: Company[], q: string): SearchResult[] {
  const out: SearchResult[] = [];
  for (const c of companies) {
    if (matchesQuery(c.name, q) || matchesQuery(c.tagline, q) || matchesQuery(c.categoryLabel, q)) {
      out.push({
        type: "company",
        slug: c.slug,
        label: c.name,
        sub: c.categoryLabel,
        image: c.logo,
        to: `/companies/${c.slug}`,
      });
    }
  }
  return out;
}

function prioritise(results: SearchResult[], limit: number): SearchResult[] {
  const order = { category: 0, company: 1, product: 2, service: 2 } as const;
  return [...results].sort((a, b) => order[a.type] - order[b.type]).slice(0, limit);
}

/**
 * Synchronous search over the LOCALLY loaded catalog (categories + the hydrated
 * company page). Used as the demo-mode path and as an instant first paint.
 */
export function search(query: string, limit = 8): SearchResult[] {
  const q = norm(query);
  if (!q) return [];
  return prioritise([...categoryResults(q), ...companyResults(getCompanies(), q)], limit);
}

/** Map one backend catalog-search result to the shape the overlay renders.
 *  Categories are always fully loaded locally, so their icon (not returned by
 *  the search endpoint — it only carries a cover image) is recovered from
 *  there by slug. */
function mapRemoteResult(r: ApiCatalogSearchResult): SearchResult {
  if (r.type === "category") {
    const local = getCategoriesWithCounts().find((c) => c.slug === r.slug);
    return {
      type: "category",
      slug: r.slug,
      label: r.name,
      sub: local ? `${local.count} companies` : r.subtitle,
      icon: local?.icon ?? "category",
      to: `/services/${r.slug}`,
    };
  }
  if (r.type === "company") {
    return {
      type: "company",
      slug: r.slug,
      label: r.name,
      sub: r.subtitle,
      image: r.image ?? "",
      to: `/companies/${r.slug}`,
    };
  }
  // product | service — an Offering, always tied to a company profile (no
  // standalone product/service page exists).
  const companySlug = r.companySlug ?? r.slug;
  return {
    type: r.type,
    label: r.name,
    sub: r.subtitle,
    image: r.image ?? "",
    companySlug,
    to: r.offeringId ? `/companies/${companySlug}?offering=${r.offeringId}` : `/companies/${companySlug}`,
  };
}

/**
 * Backend-backed search over the COMPLETE catalog — Category + Company +
 * Offering (products/services) together, ranked by relevance server-side (see
 * catalogSearch.service.ts). One request, covering everything the overlay can
 * show. Falls back to the synchronous local search when the API isn't
 * configured or the request fails.
 */
export async function searchRemote(query: string, limit = 8): Promise<SearchResult[]> {
  const q = query.trim();
  if (!q) return [];
  if (!isApiConfigured()) return search(query, limit);
  try {
    const res = await apiGet<ApiCatalogSearchResponse>(
      `/search?q=${encodeURIComponent(q)}&limit=${limit}`,
    );
    return res.results.map(mapRemoteResult);
  } catch {
    return search(query, limit); // network/parse failure → local best-effort
  }
}

// ── Recent searches (localStorage) ─────────────────────────────────────────
const RECENT_KEY = "al-assema-recent-searches";
const RECENT_MAX = 5;

export function getRecentSearches(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export function addRecentSearch(term: string) {
  const t = term.trim();
  if (!t) return;
  const existing = getRecentSearches().filter((s) => norm(s) !== norm(t));
  const next = [t, ...existing].slice(0, RECENT_MAX);
  localStorage.setItem(RECENT_KEY, JSON.stringify(next));
}

export function clearRecentSearches() {
  localStorage.removeItem(RECENT_KEY);
}
