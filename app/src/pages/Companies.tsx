import { Link } from "react-router-dom";
import { useMemo, useState } from "react";
import { useReveal } from "../hooks/useReveal";
import Stars from "../components/Stars";
import { useCompanies, useCategoriesWithCounts, useCatalogStatus, type Company } from "../lib/catalog";
import { CompanyCardSkeleton } from "../components/Skeleton";
import CatalogError from "../components/CatalogError";
import EmptyState from "../components/EmptyState";
import Modal from "../components/Modal";
import SaveButton from "../components/SaveButton";
import SearchInput from "../components/SearchInput";
import Pagination from "../components/Pagination";
import { isApiConfigured } from "../lib/api";
import { isBusy, formatReopenDate } from "../lib/availability";
import { useServerSearch } from "../hooks/useServerSearch";
import { usePageMeta } from "../hooks/usePageMeta";
import { useLocale } from "../context/LocaleContext";
import { t, tCount, type StringKey, type Locale } from "../lib/i18n";
import Icon from "../components/Icon";

// ── Sort + rating options ──────────────────────────────────────────────────
type SortKey = "recommended" | "rating" | "projects" | "reviews" | "name";

const SORTS: { key: SortKey; labelKey: StringKey }[] = [
  { key: "recommended", labelKey: "sort_recommended" },
  { key: "rating", labelKey: "sort_rating" },
  { key: "projects", labelKey: "sort_projects" },
  { key: "reviews", labelKey: "sort_reviews" },
  { key: "name", labelKey: "sort_name" },
];

// `labelKey` translates; bare `label` is used for the numeric thresholds.
const RATINGS: { value: number; label?: string; labelKey?: StringKey }[] = [
  { value: 0, labelKey: "rating_any" },
  { value: 4.5, label: "4.5+" },
  { value: 4.8, label: "4.8+" },
  { value: 5, labelKey: "rating_only" },
];

function ratingLabel(locale: Locale, r: { label?: string; labelKey?: StringKey }): string {
  return r.labelKey ? t(locale, r.labelKey) : (r.label ?? "");
}

export default function Companies() {
  const { locale } = useLocale();
  usePageMeta(`${t(locale, "meta_companies_title")} | ${t(locale, "brand_name")}`, t(locale, "companies_sub"));
  const [category, setCategory] = useState("all");
  const [minRating, setMinRating] = useState(0);
  // "Available now" is applied CLIENT-side even in API mode: effective
  // availability is derived per row by the serializer, so it is not something the
  // list query can filter on without duplicating that logic in SQL.
  const [availableOnly, setAvailableOnly] = useState(false);
  const [sort, setSort] = useState<SortKey>("recommended");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [query, setQuery] = useState("");

  const headerRef = useReveal();
  const COMPANIES = useCompanies();
  const SERVICE_CATEGORIES = useCategoriesWithCounts();
  const status = useCatalogStatus();

  // ── Search/filter/sort over the COMPLETE catalog via the backend (API mode);
  // the client-side `results` below is the demo (localStorage) path. ──
  const apiMode = isApiConfigured();
  const companySearch = useServerSearch<Company>(
    "/companies",
    query,
    {
      category: category === "all" ? undefined : category,
      minRating: minRating > 0 ? minRating : undefined,
      sort,
    },
    { pageSize: 12, enabled: apiMode },
  );

  // Cold first load / backend unreachable. In API mode this is driven by the search
  // request; in demo mode by the catalog hydration status.
  const loadingEmpty = apiMode
    ? companySearch.loading && companySearch.data.length === 0
    : status === "loading" && COMPANIES.length === 0;
  const errorEmpty = apiMode
    ? !!companySearch.error && companySearch.data.length === 0
    : status === "error" && COMPANIES.length === 0;
  // A refetch (filter/sort/page change) with a previous page already on screen —
  // distinct from `loadingEmpty` (CMP-03): keep showing the stale list instead of
  // replacing it with skeletons, but flag that it's stale until the new page lands.
  const refetching = apiMode && companySearch.loading && !loadingEmpty;

  // ── Demo-mode client filter + sort (unchanged) ──
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = COMPANIES.filter((c) => {
      if (category !== "all" && !c.categories.some((cc) => cc.slug === category)) return false;
      if (c.rating < minRating) return false;
      if (q && ![c.name, c.tagline, c.categoryLabel, ...c.services].some((v) => v.toLowerCase().includes(q))) return false;
      return true;
    });

    const sorters: Record<SortKey, (a: Company, b: Company) => number> = {
      recommended: (a, b) => b.rating - a.rating || b.completedProjects - a.completedProjects,
      rating: (a, b) => b.rating - a.rating,
      projects: (a, b) => b.completedProjects - a.completedProjects,
      reviews: (a, b) => b.reviewCount - a.reviewCount,
      // CO-05: no locale arg sorted Arabic names by code point, not collation.
      name: (a, b) => a.name.localeCompare(b.name, locale),
    };
    return [...list].sort(sorters[sort]);
  }, [COMPANIES, category, minRating, sort, query, locale]);

  // Unified view model: server page in API mode, client list in demo mode.
  const list = apiMode ? companySearch.data : results;
  const total = apiMode ? companySearch.total : results.length;
  // "Available now" (UX-01/04): applied client-side on whichever `list` is
  // already in hand, regardless of source. It used to live only inside the
  // demo-mode `results` memo above, so in API mode — where `list` comes
  // straight from `companySearch.data` — toggling it changed nothing on
  // screen even though the button visibly turned on. Availability is derived
  // per-row (busy/busyUntil), not something the list query filters on, so this
  // stays a client-side narrowing of the current page rather than a server
  // param: `total`/Pagination below stay bound to the server's count (matching
  // category/rating/search), so a filtered page can legitimately render fewer
  // cards than the count above it says — that mismatch is the accepted cost of
  // not duplicating this logic into the SQL query.
  const visibleList = availableOnly ? list.filter((c) => !isBusy(c)) : list;

  const activeCount = (category !== "all" ? 1 : 0) + (minRating > 0 ? 1 : 0) + (query.trim() ? 1 : 0) + (availableOnly ? 1 : 0);
  const categoryLabel = SERVICE_CATEGORIES.find((c) => c.slug === category)?.label;

  function clearAll() {
    setCategory("all");
    setMinRating(0);
    setSort("recommended");
    setQuery("");
    setAvailableOnly(false);
  }

  return (
    <div className="bg-surface min-h-screen">
      {/* Header */}
      <div className="bg-surface-container-lowest border-b border-surface-dim/30 pb-8 md:pb-10 px-margin-mobile md:px-margin-desktop">
        <div className="max-w-container-max mx-auto">
          <div ref={headerRef} className="fade-up">
            <div className="flex items-center gap-2 text-label font-bold text-outline mb-3">
              <Link to="/" className="hover:text-primary transition-colors">{t(locale, "nav_home")}</Link>
              <Icon name="chevron_right" className="text-label rtl-flip" />
              <span className="text-on-surface">{t(locale, "nav_companies")}</span>
            </div>
            <h1 className="text-headline md:text-display font-black text-on-surface mb-2 tracking-tight">
              {t(locale, "companies_title")}
            </h1>
            <p className="text-label md:text-subhead text-outline max-w-2xl leading-relaxed">
              {t(locale, "companies_sub")}
            </p>
          </div>
        </div>
      </div>

      {/* ── Sticky filter bar ── */}
      <div className="sticky top-[var(--nav-h)] z-30 bg-surface/95 backdrop-blur-lg border-b border-surface-dim/30">
        <div className="max-w-container-max mx-auto px-margin-mobile md:px-margin-desktop py-3 space-y-3">
          {/* Search */}
          <SearchInput value={query} onChange={setQuery} placeholder={t(locale, "search_companies_placeholder")} />
          {/* RESP-02: inline controls need room for search + N category chips +
              available-now + 2 selects in one row — 768px (tablet) doesn't have
              it. Stays the sheet-based mobile pattern through tablet, up to lg:. */}
          <div className="hidden lg:flex items-center gap-3 flex-wrap">
            {/* Category — single dropdown instead of a chip row (was wrapping
                into multiple lines once the category count grew). */}
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              aria-label={t(locale, "companies_all")}
              className="field-input !w-auto !py-2 !rounded-full text-label font-bold cursor-pointer"
            >
              <option value="all">{t(locale, "companies_all")}</option>
              {SERVICE_CATEGORIES.map((cat) => (
                <option key={cat.slug} value={cat.slug}>{cat.label}</option>
              ))}
            </select>
            <div className="flex-1" />
            {/* Available now — was mobile-sheet-only (UX-04); the desktop bar had
                no way to reach it at all, only the filter count badge on mobile
                hinted it existed. */}
            <button
              onClick={() => setAvailableOnly((v) => !v)}
              aria-pressed={availableOnly}
              className={`flex-shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-full text-label font-bold transition-colors border whitespace-nowrap
                ${availableOnly
                  ? "bg-primary text-on-primary border-primary"
                  : "bg-surface-container-lowest text-on-surface-variant border-outline-variant/30 hover:border-outline-variant"}`}
            >
              <span className="material-symbols-outlined text-label" style={{ fontVariationSettings: availableOnly ? "'FILL' 1" : "'FILL' 0" }} aria-hidden="true" translate="no">
                {availableOnly ? "check_circle" : "circle"}
              </span>
              {t(locale, "companies_available_now")}
            </button>
            {/* Rating */}
            <select
              value={minRating}
              onChange={(e) => setMinRating(Number(e.target.value))}
              aria-label={t(locale, "companies_min_rating")}
              className="field-input !w-auto !py-2 !rounded-full text-label font-bold cursor-pointer"
            >
              {RATINGS.map((r) => <option key={r.value} value={r.value}>{ratingLabel(locale, r)}</option>)}
            </select>
            {/* Sort */}
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              aria-label={t(locale, "sort_prefix")}
              className="field-input !w-auto !py-2 !rounded-full text-label font-bold cursor-pointer"
            >
              {SORTS.map((s) => <option key={s.key} value={s.key}>{`${t(locale, "sort_prefix")} ${t(locale, s.labelKey)}`}</option>)}
            </select>
          </div>

          {/* Mobile + tablet: category scroll + filter button (sheet) */}
          <div className="lg:hidden flex items-center gap-2">
            <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide flex-1 -mx-1 px-1">
              <FilterChip active={category === "all"} onClick={() => setCategory("all")}>{t(locale, "companies_all")}</FilterChip>
              {SERVICE_CATEGORIES.map((cat) => (
                <FilterChip key={cat.slug} active={category === cat.slug} onClick={() => setCategory(cat.slug)} icon={cat.icon}>
                  {cat.label}
                </FilterChip>
              ))}
            </div>
            <button
              onClick={() => setSheetOpen(true)}
              className="flex-shrink-0 flex items-center gap-1.5 bg-surface-container-lowest border border-outline-variant/40 rounded-full px-3.5 py-2 text-label font-bold text-on-surface relative"
            >
              <Icon name="tune" className="text-subhead" />
              {t(locale, "companies_filters")}
              {(minRating > 0 || sort !== "recommended" || category !== "all" || availableOnly) && (
                <span className="absolute -top-1 -right-1 rtl:right-auto rtl:-left-1 w-4 h-4 bg-primary text-on-primary text-caption font-black rounded-full flex items-center justify-center">
                  {(minRating > 0 ? 1 : 0) + (sort !== "recommended" ? 1 : 0) + (category !== "all" ? 1 : 0) + (availableOnly ? 1 : 0)}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ── Results ── */}
      <div className="max-w-container-max mx-auto px-margin-mobile md:px-margin-desktop py-6 md:py-8">
        {/* Result count + active chips */}
        <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
          {!loadingEmpty && !errorEmpty && (
            <p className="text-label text-outline" role="status" aria-live="polite" aria-atomic="true">
              <span className="font-black text-on-surface">{total}</span>{" "}
              {tCount(locale, "noun_company", total)}
              {categoryLabel && <span> {t(locale, "companies_in")} <span className="font-bold text-on-surface">{categoryLabel}</span></span>}
            </p>
          )}
          {activeCount > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              {query.trim() && (
                <ActiveChip onRemove={() => setQuery("")} label={t(locale, "companies_remove_filter")}>"{query.trim()}"</ActiveChip>
              )}
              {category !== "all" && (
                <ActiveChip onRemove={() => setCategory("all")} label={t(locale, "companies_remove_filter")}>{categoryLabel}</ActiveChip>
              )}
              {minRating > 0 && (
                <ActiveChip onRemove={() => setMinRating(0)} label={t(locale, "companies_remove_filter")}>{ratingLabel(locale, RATINGS.find((r) => r.value === minRating)!)}</ActiveChip>
              )}
              {availableOnly && (
                <ActiveChip onRemove={() => setAvailableOnly(false)} label={t(locale, "companies_remove_filter")}>{t(locale, "companies_available_now")}</ActiveChip>
              )}
              <button onClick={clearAll} className="text-label font-bold text-primary hover:underline">{t(locale, "common_clear_all")}</button>
            </div>
          )}
        </div>

        {/* Loading / error / grid / empty */}
        {loadingEmpty ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-gutter">
            {Array.from({ length: 6 }).map((_, i) => <CompanyCardSkeleton key={i} />)}
          </div>
        ) : errorEmpty ? (
          <CatalogError />
        ) : visibleList.length === 0 ? (
          <div className="bg-surface-container-lowest rounded-2xl shadow-bloom">
            <EmptyState
              icon="search_off"
              title={t(locale, "companies_none_title")}
              msg={t(locale, "companies_none_sub")}
              action={{ label: t(locale, "companies_reset_filters"), onClick: clearAll }}
            />
          </div>
        ) : (
          <>
            <div
              className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-gutter transition-opacity ${refetching ? "opacity-60 pointer-events-none" : ""}`}
              aria-busy={refetching}
            >
              {visibleList.map((c, i) => (
                <CompanyCard key={c.id} company={c} delay={Math.min(i, 6) * 60} />
              ))}
            </div>
            {apiMode && (
              <Pagination
                className="mt-8"
                page={companySearch.page}
                pageCount={companySearch.pageCount}
                total={companySearch.total}
                pageSize={companySearch.pageSize}
                onPage={(p) => { companySearch.setPage(p); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                nounKey="noun_company"
              />
            )}
          </>
        )}
      </div>

      {/* ── Mobile filter sheet ── */}
      {sheetOpen && (
        <Modal
          variant="sheet"
          onClose={() => setSheetOpen(false)}
          title={t(locale, "companies_filters_sort")}
          panelClassName="p-5 pb-8"
        >
            {/* Availability */}
            <p className="text-caption font-black ltr:uppercase ltr:tracking-wider text-outline mb-2.5">{t(locale, "companies_availability")}</p>
            <button
              onClick={() => setAvailableOnly((v) => !v)}
              aria-pressed={availableOnly}
              className={`w-full flex items-center gap-2 py-2.5 px-3 rounded-xl text-label font-bold border transition-colors mb-6
                ${availableOnly ? "bg-primary text-on-primary border-primary" : "bg-surface-container border-transparent text-on-surface-variant"}`}
            >
              <span className="material-symbols-outlined text-subhead" aria-hidden="true" translate="no">{availableOnly ? "check_circle" : "circle"}</span>
              {t(locale, "companies_available_now")}
            </button>

            {/* Rating */}
            <p className="text-caption font-black ltr:uppercase ltr:tracking-wider text-outline mb-2.5">{t(locale, "companies_min_rating")}</p>
            <div className="grid grid-cols-4 gap-2 mb-6">
              {RATINGS.map((r) => (
                <button
                  key={r.value}
                  onClick={() => setMinRating(r.value)}
                  className={`py-2.5 rounded-xl text-label font-bold border transition-colors
                    ${minRating === r.value ? "bg-primary text-on-primary border-primary" : "bg-surface-container border-transparent text-on-surface-variant"}`}
                >
                  {ratingLabel(locale, r)}
                </button>
              ))}
            </div>

            {/* Sort */}
            <p className="text-caption font-black ltr:uppercase ltr:tracking-wider text-outline mb-2.5">{t(locale, "companies_sort_by")}</p>
            <div className="space-y-2 mb-6">
              {SORTS.map((s) => (
                <button
                  key={s.key}
                  onClick={() => setSort(s.key)}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-label font-bold border transition-colors
                    ${sort === s.key ? "bg-primary/8 text-primary border-primary/30" : "bg-surface-container border-transparent text-on-surface-variant"}`}
                >
                  {t(locale, s.labelKey)}
                  {sort === s.key && <Icon name="check" className="text-subhead" />}
                </button>
              ))}
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button onClick={clearAll} className="flex-1 py-3.5 rounded-xl border border-outline-variant/40 font-bold text-body text-on-surface touch-press">
                {t(locale, "common_reset")}
              </button>
              <button onClick={() => setSheetOpen(false)} className="flex-[2] py-3.5 rounded-xl bg-primary text-on-primary font-bold text-body touch-press btn-press">
                {t(locale, "companies_show")} {total} {tCount(locale, "noun_search_result", total)}
              </button>
            </div>
        </Modal>
      )}
    </div>
  );
}

// ── Filter chip ──
function FilterChip({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon?: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex-shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-full text-label font-bold transition-colors border whitespace-nowrap
        ${active
          ? "bg-primary text-on-primary border-primary"
          : "bg-surface-container-lowest text-on-surface-variant border-outline-variant/30 hover:border-outline-variant"}`}
    >
      {icon && <span className="material-symbols-outlined text-label" style={{ fontVariationSettings: "'FILL' 1" }} aria-hidden="true" translate="no">{icon}</span>}
      {children}
    </button>
  );
}

// ── Active filter chip (removable) ──
function ActiveChip({ onRemove, children, label }: { onRemove: () => void; children: React.ReactNode; label: string }) {
  return (
    <span className="flex items-center gap-1 bg-primary/10 text-primary px-2.5 py-1 rounded-full text-caption font-bold">
      {children}
      <button onClick={onRemove} className="w-11 h-11 -m-2.5 flex items-center justify-center hover:bg-primary/15 rounded-full" aria-label={label}>
        <Icon name="close" className="text-body" />
      </button>
    </span>
  );
}

// ── Company card ──
function CompanyCard({ company: c, delay }: { company: Company; delay: number }) {
  const ref = useReveal();
  const { locale } = useLocale();

  return (
    <div ref={ref} className="fade-up" style={{ transitionDelay: `${delay}ms` }}>
      <Link
        to={`/companies/${c.slug}`}
        className="group bg-surface-container-lowest rounded-2xl overflow-hidden shadow-bloom card-lift flex flex-col h-full touch-press"
      >
        <div className="relative h-44 overflow-hidden">
          <img src={c.cover} alt={c.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-slow" loading="lazy" width={400} height={176} />
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
          {/* CO-01: logo and save button now share the same 16px inset (was
              20px/12px — an 8px mismatch between two corner elements on the
              same card). */}
          <div className="absolute top-4 left-4 rtl:left-auto rtl:right-4 z-10 w-14 h-14 rounded-xl overflow-hidden border-2 border-white shadow-md bg-white">
            <img src={c.logo} alt={`${c.name} logo`} className="w-full h-full object-cover" loading="lazy" width={56} height={56} />
          </div>
          {/* Save heart — top-right (convention) */}
          <SaveButton slug={c.slug} className="absolute top-4 right-4 rtl:right-auto rtl:left-4" />
          {isBusy(c) && (
            <span className="absolute bottom-3 left-3 rtl:left-auto rtl:right-3 z-10 flex items-center gap-1 bg-amber-500 text-white text-caption font-bold px-2 py-1 rounded-full shadow-md">
              <Icon name="event_busy" className="text-label" style={{ fontVariationSettings: "'FILL' 1" }} />
              {t(locale, "busy_badge")}
            </span>
          )}
        </div>

        {/* CO-02: pt-9 was reserving space for a logo overhang that doesn't
            exist — the logo sits fully inside the h-44 cover above. */}
        <div className="pt-4 px-5 pb-5 flex-grow flex flex-col">
          <div className="flex items-center gap-1.5 mb-0.5">
            <h3 className="font-bold text-subhead text-on-surface group-hover:text-primary transition-colors">{c.name}</h3>
            {c.verified && (
              <Icon name="verified" className="text-primary text-body flex-shrink-0" style={{ fontVariationSettings: "'FILL' 1" }} title={t(locale, "companies_verified_title")} />
            )}
          </div>
          <p className="text-label font-bold text-outline mb-2">{c.categoryLabel}</p>
          <div className="flex items-center gap-2 mb-3">
            <Stars n={Math.round(c.rating)} />
            <span className="font-bold text-label text-on-surface">{c.rating}</span>
            <span className="text-outline text-caption">({c.reviewCount})</span>
          </div>
          <p className="text-label text-on-surface-variant line-clamp-2 flex-grow leading-relaxed">{c.tagline}</p>
          <div className="mt-4 pt-4 border-t border-outline-variant/20 flex items-center justify-between">
            <span className="text-caption text-outline">{c.completedProjects} {tCount(locale, "noun_project", c.completedProjects)}</span>
            <span className="text-label font-bold text-primary flex items-center gap-1 group-hover:translate-x-1 rtl:group-hover:-translate-x-1 transition-transform">
              {t(locale, "common_view_profile")} <Icon name="arrow_forward" className="text-body rtl-flip" />
            </span>
          </div>
        </div>
      </Link>
    </div>
  );
}
