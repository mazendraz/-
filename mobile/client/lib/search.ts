/**
 * Unified search across companies and services — the mobile counterpart of
 * the website's lib/search.ts. Companies come from the backend's `search`
 * param on /companies (the COMPLETE dataset, not just what happens to be
 * loaded on screen); categories are already fully loaded via
 * fetchCategories() elsewhere and matched client-side here — the same split
 * the website's searchRemote() uses. No local/demo fallback: unlike the
 * website, this app always talks to a real API.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { ApiCategory, ApiCompany } from "@alassema/core";
import { fetchCompanies } from "./companies";

export type SearchResult =
  | { type: "service"; key: string; label: string; sub: string; icon: string; to: string }
  | { type: "company"; key: string; label: string; sub: string; image: string; rating: number; to: string }
  | { type: "serviceItem"; key: string; label: string; sub: string; image: string; to: string };

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

/** True if `text` contains or fuzzy-matches the pre-normalised query `normQ`. */
function matchesQuery(text: string, normQ: string): boolean {
  const nt = norm(text);
  if (nt.includes(normQ)) return true;
  const tokens = normQ.split(/\s+/).filter(Boolean);
  if (tokens.length > 1 && tokens.every((t) => nt.includes(t))) return true;
  if (tokens.length === 1 && bigramSim(nt, normQ) > 0.4) return true;
  return false;
}

function categoryResults(categories: ApiCategory[], q: string): SearchResult[] {
  const out: SearchResult[] = [];
  for (const cat of categories) {
    if (matchesQuery(cat.label, q) || matchesQuery(cat.description, q)) {
      out.push({
        type: "service",
        key: `service-${cat.slug}`,
        label: cat.label,
        sub: `${cat.count} شركة`,
        icon: cat.icon,
        to: `/services/${cat.slug}`,
      });
    }
  }
  return out;
}

function companyResults(companies: ApiCompany[], q: string): SearchResult[] {
  const out: SearchResult[] = [];
  for (const c of companies) {
    if (matchesQuery(c.name, q) || matchesQuery(c.tagline, q) || matchesQuery(c.categoryLabel, q)) {
      out.push({
        type: "company",
        key: `company-${c.slug}`,
        label: c.name,
        sub: c.categoryLabel,
        image: c.logo,
        rating: c.rating,
        to: `/company/${c.slug}`,
      });
    }
  }
  const seen = new Set<string>();
  for (const c of companies) {
    for (const svc of c.services) {
      const key = `${norm(svc)}|${c.slug}`;
      if (matchesQuery(svc, q) && !seen.has(key)) {
        seen.add(key);
        out.push({
          type: "serviceItem",
          key: `item-${key}`,
          label: svc,
          sub: `عند ${c.name}`,
          image: c.logo,
          to: `/company/${c.slug}`,
        });
      }
    }
  }
  return out;
}

function prioritise(results: SearchResult[], limit: number): SearchResult[] {
  const order = { service: 0, company: 1, serviceItem: 2 } as const;
  return [...results].sort((a, b) => order[a.type] - order[b.type]).slice(0, limit);
}

/** Backend-backed search over the complete company dataset + the already-
 *  loaded categories. `categories` is passed in rather than fetched here —
 *  the caller already has them (fetchCategories() is cheap and shared). */
export async function searchRemote(
  categories: ApiCategory[],
  query: string,
  limit = 20,
): Promise<SearchResult[]> {
  const q = norm(query);
  if (!q) return [];
  const page = await fetchCompanies(query, { pageSize: limit });
  return prioritise([...categoryResults(categories, q), ...companyResults(page.data, q)], limit);
}

// ── Recent searches (device-local, AsyncStorage — the RN counterpart of the
// website's localStorage version) ──────────────────────────────────────────
const RECENT_KEY = "al-assema-recent-searches";
const RECENT_MAX = 5;

export async function getRecentSearches(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(RECENT_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export async function addRecentSearch(term: string): Promise<void> {
  const t = term.trim();
  if (!t) return;
  const existing = (await getRecentSearches()).filter((s) => norm(s) !== norm(t));
  await AsyncStorage.setItem(RECENT_KEY, JSON.stringify([t, ...existing].slice(0, RECENT_MAX)));
}

export async function clearRecentSearches(): Promise<void> {
  await AsyncStorage.removeItem(RECENT_KEY);
}
