// Public global search — the ONE search behind both the website and the mobile
// app (see app/src/lib/search.ts's searchCatalog / mobile/client/lib/search.ts's
// searchRemote). Searches Category + Company + Offering (products/services)
// together and ranks them by relevance, bilingually.
//
// Deliberately NOT the same file/feature as globalSearch.service.ts — that one
// is the internal Business Control Center's search over Client/Provider/
// Request/Service/Transaction, permission-filtered staff data. This is public,
// unauthenticated, catalog-only, and a different domain entirely.
import { prisma } from "@/lib/prisma";
import { CompanyStatus } from "@/generated/prisma/enums";
import type { ApiCatalogSearchResult } from "@/lib/apiTypes";

const MIN_QUERY_LENGTH = 2;
/**
 * Longest query we will actually score. Not a UX limit — a cost ceiling.
 *
 * Every row in the catalogue is scored in JS (see searchCompanies), and the
 * fuzzy fallback in matchTier builds a bigram set sized by the QUERY. Cost is
 * therefore O(|q| × rows), synchronous, on a single PM2 fork — so an
 * unbounded `q` is a denial-of-service primitive, not just a slow search: a
 * ~15,000-character query (Node's default 16KB header cap is the only other
 * bound) measured at ~1.8s of fully blocked event loop against a 5,000-row
 * catalogue, and nothing else in the process runs during it.
 *
 * Truncating rather than rejecting: a query this long is a bot or a paste
 * accident, and neither deserves an error page. The first 80 characters are
 * far more than any real search and score identically for one.
 */
const MAX_QUERY_LENGTH = 80;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
// A circuit breaker, not a correctness boundary: Company/Offering are fetched
// and scored in full (see the comment on searchCompanies for why there's no
// DB-side text filter to narrow them down first), so this only guards against
// a pathological future catalog size. Set far above any realistic scale for a
// curated, manually-vetted directory — a real cap here would silently drop
// arbitrary rows (no orderBy) before they ever reach scoring.
const SAFETY_FETCH_CAP = 5000;

// ── Arabic-aware normalization + fuzzy match ────────────────────────────────
// Ported from app/src/lib/search.ts's norm()/bigramSim() so the server's
// authoritative ranking behaves exactly like the client's existing instant
// local search, just extended to Offerings and made bilingual.
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

/**
 * The search term, prepared once.
 *
 * `bigrams` is the reason this is an object rather than the `(normQ, tokens)`
 * pair it replaced: bigramSim needs the QUERY's bigram set on every call, and
 * it used to rebuild it per candidate string — ~15,000 allocations of a
 * query-sized Set per request, for a value that never changes. Computing it
 * here means the per-candidate cost is the candidate's own length, not the
 * query's.
 */
interface Query {
  norm: string;
  tokens: string[];
  bigrams: Set<string>;
}

function parseQuery(normQ: string): Query {
  return { norm: normQ, tokens: normQ.split(/\s+/).filter(Boolean), bigrams: bigrams(normQ) };
}

/** Dice coefficient between one candidate string and the (pre-bigrammed) query. */
function bigramSim(text: string, q: Query): number {
  const bg = bigrams(text);
  if (!bg.size || !q.bigrams.size) return 0;
  let shared = 0;
  bg.forEach((g) => { if (q.bigrams.has(g)) shared++; });
  return (2 * shared) / (bg.size + q.bigrams.size);
}

// 0 = no match, 1 = partial/fuzzy, 2 = prefix, 3 = exact.
function matchTier(text: string, q: Query): 0 | 1 | 2 | 3 {
  const nt = norm(text);
  if (!nt) return 0;
  if (nt === q.norm) return 3;
  if (nt.startsWith(q.norm)) return 2;
  if (nt.includes(q.norm)) return 1;
  if (q.tokens.length > 1 && q.tokens.every((t) => nt.includes(t))) return 1;
  if (q.tokens.length === 1 && bigramSim(nt, q) > 0.4) return 1;
  return 0;
}

const NAME_TIER_SCORE = { 0: 0, 1: 60, 2: 80, 3: 100 } as const;

/** Best "this IS the thing" score across a set of name-like candidates. */
function nameScore(candidates: (string | null | undefined)[], q: Query): number {
  let best = 0;
  for (const c of candidates) {
    if (!c) continue;
    best = Math.max(best, NAME_TIER_SCORE[matchTier(c, q)]);
  }
  return best;
}

/** Whether ANY candidate matches at all (tier ≥ 1), for the lower-priority bands. */
function anyMatch(candidates: (string | null | undefined)[], q: Query): boolean {
  return candidates.some((c) => c != null && matchTier(c, q) > 0);
}

// Ranking bands, per the spec's priority order: exact/prefix/partial name match
// (handled by nameScore's 100/80/60) > tag/keyword (40) > description (25) >
// related company/category match only (15). No result type gets a hardcoded
// boost — a Product/Service can outrank a Company/Category purely on score.
const TAG_SCORE = 40;
const DESCRIPTION_SCORE = 25;
const RELATED_SCORE = 15;

interface Scored {
  result: ApiCatalogSearchResult;
  score: number;
}

async function searchCategories(q: Query): Promise<Scored[]> {
  // No DB-side text filter: categories are a small, curated list (every other
  // part of this codebase — e.g. the website's local categoryResults() —
  // already fully loads them client-side unconditionally), so scoring every
  // active row in JS is both cheap and more correct than an ILIKE filter would
  // be here (same reasoning applies to Company/Offering below — see the
  // comment on searchCompanies for why they're fetched the same way).
  const rows = await prisma.category.findMany({
    where: { isActive: true },
    select: { id: true, slug: true, label: true, labelAr: true, description: true, descriptionAr: true, cover: true },
  });

  return rows.map((c) => {
    const score = Math.max(
      nameScore([c.label, c.labelAr], q),
      anyMatch([c.description, c.descriptionAr], q) ? DESCRIPTION_SCORE : 0,
    );
    return {
      score,
      result: {
        type: "category",
        id: c.id,
        slug: c.slug,
        name: c.label,
        nameAr: c.labelAr,
        subtitle: c.description,
        image: c.cover ?? null,
      },
    };
  });
}

// Companies, like Categories above, are fetched WITHOUT a DB-side text filter
// and scored entirely in JS. This was originally an ILIKE OR-filter (cheaper
// per request), but that broke exactly the Arabic-normalization matching this
// endpoint exists to provide: Postgres's `mode: "insensitive"` only case-folds
// — it doesn't fold hamza/ta-marbuta variants the way `norm()` does — so e.g.
// a query typed without a hamza would silently fail to even reach the JS
// scorer for a company whose stored name has one. Verified against the local
// catalog: "الانشاءات" (no hamza) failed to find "الإنشاءات" (with hamza)
// under the ILIKE-prefilter version and succeeds under this one. This
// directory is curated/manually-vetted (see the website's own copy — "no open
// registration"), so a full scan stays cheap for the realistic future size;
// `take` below is a circuit-breaker against a pathological one, not the
// correctness boundary.
async function searchCompanies(q: Query): Promise<Scored[]> {
  const rows = await prisma.company.findMany({
    where: { status: CompanyStatus.ACTIVE },
    select: {
      id: true, slug: true, name: true, nameAr: true, tagline: true, logo: true, services: true,
      categories: {
        where: { isPrimary: true },
        take: 1,
        select: { category: { select: { label: true, labelAr: true } } },
      },
    },
    take: SAFETY_FETCH_CAP,
  });

  return rows.map((c) => {
    const primary = c.categories[0]?.category;
    const score = Math.max(
      nameScore([c.name, c.nameAr], q),
      anyMatch([c.tagline], q) ? DESCRIPTION_SCORE : 0,
      anyMatch(c.services, q) ? TAG_SCORE : 0,
      primary && anyMatch([primary.label, primary.labelAr], q) ? RELATED_SCORE : 0,
    );
    return {
      score,
      result: {
        type: "company",
        id: c.id,
        slug: c.slug,
        name: c.name,
        nameAr: c.nameAr,
        subtitle: primary?.label ?? c.tagline,
        image: c.logo,
      },
    };
  });
}

// Same reasoning as searchCompanies above: fetch published+active offerings
// for ACTIVE companies with no DB-side text filter, score in JS.
async function searchOfferings(q: Query): Promise<Scored[]> {
  const rows = await prisma.offering.findMany({
    where: {
      isPublished: true,
      isActive: true,
      company: { status: CompanyStatus.ACTIVE },
    },
    select: {
      id: true, name: true, nameAr: true, description: true, descriptionAr: true, tags: true,
      kind: true, image: true,
      company: {
        select: {
          slug: true, name: true, nameAr: true,
          categories: {
            where: { isPrimary: true },
            take: 1,
            select: { category: { select: { label: true, labelAr: true } } },
          },
        },
      },
    },
    take: SAFETY_FETCH_CAP,
  });

  return rows.map((o) => {
    const primary = o.company.categories[0]?.category;
    const score = Math.max(
      nameScore([o.name, o.nameAr], q),
      anyMatch(o.tags, q) ? TAG_SCORE : 0,
      anyMatch([o.description, o.descriptionAr], q) ? DESCRIPTION_SCORE : 0,
      anyMatch([o.company.name, o.company.nameAr, primary?.label, primary?.labelAr], q)
        ? RELATED_SCORE
        : 0,
    );
    return {
      score,
      result: {
        type: o.kind === "PRODUCT" ? "product" : "service",
        id: o.id,
        slug: o.company.slug,
        name: o.name,
        nameAr: o.nameAr,
        subtitle: o.company.name,
        image: o.image ?? null,
        companySlug: o.company.slug,
        offeringId: o.id,
      },
    };
  });
}

/** Public: unified Category + Company + Offering search, ranked by relevance. */
export async function searchCatalog(query: string, limit = DEFAULT_LIMIT): Promise<ApiCatalogSearchResult[]> {
  const q = query.trim();
  if (q.length < MIN_QUERY_LENGTH) return [];
  // Truncated BEFORE normalization, so nothing downstream ever sees the full
  // length — see MAX_QUERY_LENGTH for why that is a cost ceiling, not a UX one.
  const parsed = parseQuery(norm(q.slice(0, MAX_QUERY_LENGTH)));
  const cappedLimit = Math.min(Math.max(limit, 1), MAX_LIMIT);

  const [categories, companies, offerings] = await Promise.all([
    searchCategories(parsed),
    searchCompanies(parsed),
    searchOfferings(parsed),
  ]);

  return [...categories, ...companies, ...offerings]
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, cappedLimit)
    .map((r) => r.result);
}
