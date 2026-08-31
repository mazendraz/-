/**
 * Unified search across categories, companies, and products/services — the
 * mobile counterpart of the website's lib/search.ts. Backed by the same
 * /search endpoint (catalogSearch.service.ts) both platforms share, so ranking
 * and bilingual matching behave identically here and on the website.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { ApiCatalogSearchResponse, ApiCatalogSearchResult } from "@alassema/core";
import { apiGet } from "@alassema/mobile-shared";

export type SearchResult =
  | { type: "category"; key: string; label: string; sub: string; icon: string; to: string }
  | { type: "company"; key: string; label: string; sub: string; image: string; to: string }
  | { type: "product" | "service"; key: string; label: string; sub: string; image: string; to: string };

// Categories don't carry an icon on the search endpoint's response (only a
// cover image) — every category result falls back to one shared glyph rather
// than needing a second lookup against the already-loaded category list.
const CATEGORY_ICON = "grid_view";

function mapResult(r: ApiCatalogSearchResult): SearchResult {
  if (r.type === "category") {
    return {
      type: "category",
      key: `category-${r.slug}`,
      label: r.name,
      sub: r.subtitle,
      icon: CATEGORY_ICON,
      to: `/services/${r.slug}`,
    };
  }
  if (r.type === "company") {
    return {
      type: "company",
      key: `company-${r.slug}`,
      label: r.name,
      sub: r.subtitle,
      image: r.image ?? "",
      to: `/company/${r.slug}`,
    };
  }
  // product | service — an Offering, always tied to a company profile (no
  // standalone product/service screen exists).
  const companySlug = r.companySlug ?? r.slug;
  return {
    type: r.type,
    key: `${r.type}-${r.id}`,
    label: r.name,
    sub: r.subtitle,
    image: r.image ?? "",
    to: r.offeringId ? `/company/${companySlug}?offering=${r.offeringId}` : `/company/${companySlug}`,
  };
}

/** Backend-backed search over the COMPLETE catalog — same endpoint and
 *  ranking the website uses. */
export async function searchRemote(query: string, limit = 20): Promise<SearchResult[]> {
  const q = query.trim();
  if (!q) return [];
  const res = await apiGet<ApiCatalogSearchResponse>(
    `/search?q=${encodeURIComponent(q)}&limit=${limit}`,
  );
  return res.results.map(mapResult);
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
  const existing = (await getRecentSearches()).filter((s) => s.trim().toLowerCase() !== t.toLowerCase());
  await AsyncStorage.setItem(RECENT_KEY, JSON.stringify([t, ...existing].slice(0, RECENT_MAX)));
}

export async function clearRecentSearches(): Promise<void> {
  await AsyncStorage.removeItem(RECENT_KEY);
}
