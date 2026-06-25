import { getCompanies, getCategoriesWithCounts } from "./catalog";

export type SearchResult =
  | { type: "service"; slug: string; label: string; sub: string; icon: string; to: string }
  | { type: "company"; slug: string; label: string; sub: string; image: string; to: string; rating: number }
  | { type: "serviceItem"; label: string; sub: string; companySlug: string; to: string; image: string };

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

/**
 * Universal client-side search across service categories, companies,
 * and the individual services each company offers. Instant — all local.
 */
export function search(query: string, limit = 8): SearchResult[] {
  const q = norm(query);
  if (!q) return [];

  const results: SearchResult[] = [];
  const COMPANIES = getCompanies();
  const SERVICE_CATEGORIES = getCategoriesWithCounts();

  // 1. Service categories
  for (const cat of SERVICE_CATEGORIES) {
    if (matchesQuery(cat.label, q) || matchesQuery(cat.description, q)) {
      results.push({
        type: "service",
        slug: cat.slug,
        label: cat.label,
        sub: `${cat.count} companies`,
        icon: cat.icon,
        to: `/services/${cat.slug}`,
      });
    }
  }

  // 2. Companies (by name, tagline, category)
  for (const c of COMPANIES) {
    if (
      matchesQuery(c.name, q) ||
      matchesQuery(c.tagline, q) ||
      matchesQuery(c.categoryLabel, q)
    ) {
      results.push({
        type: "company",
        slug: c.slug,
        label: c.name,
        sub: c.categoryLabel,
        image: c.logo,
        rating: c.rating,
        to: `/companies/${c.slug}`,
      });
    }
  }

  // 3. Individual services offered by companies (e.g. "CCTV", "Pool")
  const seen = new Set<string>();
  for (const c of COMPANIES) {
    for (const svc of c.services) {
      const key = norm(svc) + "|" + c.slug;
      if (matchesQuery(svc, q) && !seen.has(key)) {
        seen.add(key);
        results.push({
          type: "serviceItem",
          label: svc,
          sub: `by ${c.name}`,
          companySlug: c.slug,
          image: c.logo,
          to: `/companies/${c.slug}`,
        });
      }
    }
  }

  // Prioritize: services → companies → service items, then cap
  const order = { service: 0, company: 1, serviceItem: 2 } as const;
  results.sort((a, b) => order[a.type] - order[b.type]);

  return results.slice(0, limit);
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
