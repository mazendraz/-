import { Link } from "react-router-dom";
import { useMemo, useState } from "react";
import { useReveal } from "../hooks/useReveal";
import Stars from "../components/Stars";
import { useDialogA11y } from "../hooks/useDialogA11y";
import { useCompanies, useCategoriesWithCounts, useCatalogStatus, type Company } from "../lib/catalog";
import { CompanyCardSkeleton } from "../components/Skeleton";
import CatalogError from "../components/CatalogError";
import SaveButton from "../components/SaveButton";
import SearchInput from "../components/SearchInput";
import Pagination from "../components/Pagination";
import { isApiConfigured } from "../lib/api";
import { useServerSearch } from "../hooks/useServerSearch";
import { usePageMeta } from "../hooks/usePageMeta";
import { useLocale } from "../context/LocaleContext";
import { t, type StringKey, type Locale } from "../lib/i18n";

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
  usePageMeta("Verified Companies | Al Assema", "Browse verified companies by rating, speciality, and completed projects in the New Administrative Capital.");
  const { locale } = useLocale();
  const [category, setCategory] = useState("all");
  const [minRating, setMinRating] = useState(0);
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

  // ── Demo-mode client filter + sort (unchanged) ──
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = COMPANIES.filter((c) => {
      if (category !== "all" && c.category !== category) return false;
      if (c.rating < minRating) return false;
      if (q && ![c.name, c.tagline, c.categoryLabel, ...c.services].some((v) => v.toLowerCase().includes(q))) return false;
      return true;
    });

    const sorters: Record<SortKey, (a: Company, b: Company) => number> = {
      recommended: (a, b) => b.rating - a.rating || b.completedProjects - a.completedProjects,
      rating: (a, b) => b.rating - a.rating,
      projects: (a, b) => b.completedProjects - a.completedProjects,
      reviews: (a, b) => b.reviewCount - a.reviewCount,
      name: (a, b) => a.name.localeCompare(b.name),
    };
    return [...list].sort(sorters[sort]);
  }, [COMPANIES, category, minRating, sort, query]);

  // Unified view model: server page in API mode, client list in demo mode.
  const list = apiMode ? companySearch.data : results;
  const total = apiMode ? companySearch.total : results.length;

  const activeCount = (category !== "all" ? 1 : 0) + (minRating > 0 ? 1 : 0) + (query.trim() ? 1 : 0);
  const categoryLabel = SERVICE_CATEGORIES.find((c) => c.slug === category)?.label;

  function clearAll() {
    setCategory("all");
    setMinRating(0);
    setSort("recommended");
    setQuery("");
  }

  const { containerRef: sheetRef, trapTab: trapSheetTab } = useDialogA11y(sheetOpen, () => setSheetOpen(false));

  return (
    <div className="bg-surface min-h-screen">
      {/* Header */}
      <div className="bg-surface-container-lowest border-b border-surface-dim/30 pt-24 md:pt-28 pb-8 md:pb-10 px-margin-mobile md:px-margin-desktop">
        <div className="max-w-container-max mx-auto">
          <div ref={headerRef} className="fade-up">
            <div className="flex items-center gap-2 text-[13px] font-bold text-outline mb-3">
              <Link to="/" className="hover:text-primary transition-colors">{t(locale, "nav_home")}</Link>
              <span className="material-symbols-outlined text-[14px] rtl-flip">chevron_right</span>
              <span className="text-on-surface">{t(locale, "nav_companies")}</span>
            </div>
            <h1 className="text-[26px] md:text-headline-lg font-black text-on-surface mb-2 tracking-tight">
              {t(locale, "companies_title")}
            </h1>
            <p className="text-[14px] md:text-body-lg text-outline max-w-2xl leading-relaxed">
              {t(locale, "companies_sub")}
            </p>
          </div>
        </div>
      </div>

      {/* ── Sticky filter bar ── */}
      <div className="sticky top-[60px] md:top-[76px] z-30 bg-surface/95 backdrop-blur-lg border-b border-surface-dim/30">
        <div className="max-w-container-max mx-auto px-margin-mobile md:px-margin-desktop py-3 space-y-3">
          {/* Search */}
          <SearchInput value={query} onChange={setQuery} placeholder={t(locale, "search_companies_placeholder")} />
          {/* Desktop: inline controls */}
          <div className="hidden md:flex items-center gap-3 flex-wrap">
            {/* Category chips */}
            <div className="flex items-center gap-2 flex-wrap flex-1">
              <FilterChip active={category === "all"} onClick={() => setCategory("all")}>{t(locale, "companies_all")}</FilterChip>
              {SERVICE_CATEGORIES.map((cat) => (
                <FilterChip key={cat.slug} active={category === cat.slug} onClick={() => setCategory(cat.slug)} icon={cat.icon}>
                  {cat.label}
                </FilterChip>
              ))}
            </div>
            {/* Rating */}
            <select
              value={minRating}
              onChange={(e) => setMinRating(Number(e.target.value))}
              className="field-input !w-auto !py-2 !rounded-full text-[13px] font-bold cursor-pointer"
            >
              {RATINGS.map((r) => <option key={r.value} value={r.value}>{ratingLabel(locale, r)}</option>)}
            </select>
            {/* Sort */}
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="field-input !w-auto !py-2 !rounded-full text-[13px] font-bold cursor-pointer"
            >
              {SORTS.map((s) => <option key={s.key} value={s.key}>{`${t(locale, "sort_prefix")} ${t(locale, s.labelKey)}`}</option>)}
            </select>
          </div>

          {/* Mobile: category scroll + filter button */}
          <div className="md:hidden flex items-center gap-2">
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
              className="flex-shrink-0 flex items-center gap-1.5 bg-surface-container-lowest border border-outline-variant/40 rounded-full px-3.5 py-2 text-[13px] font-bold text-on-surface relative"
            >
              <span className="material-symbols-outlined text-[18px]">tune</span>
              {t(locale, "companies_filters")}
              {(minRating > 0 || sort !== "recommended") && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-primary text-on-primary text-[10px] font-black rounded-full flex items-center justify-center">
                  {(minRating > 0 ? 1 : 0) + (sort !== "recommended" ? 1 : 0)}
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
            <p className="text-[14px] text-outline">
              <span className="font-black text-on-surface">{total}</span>{" "}
              {total === 1 ? t(locale, "common_company") : t(locale, "common_companies")}
              {categoryLabel && <span> {t(locale, "companies_in")} <span className="font-bold text-on-surface">{categoryLabel}</span></span>}
            </p>
          )}
          {activeCount > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              {query.trim() && (
                <ActiveChip onRemove={() => setQuery("")}>"{query.trim()}"</ActiveChip>
              )}
              {category !== "all" && (
                <ActiveChip onRemove={() => setCategory("all")}>{categoryLabel}</ActiveChip>
              )}
              {minRating > 0 && (
                <ActiveChip onRemove={() => setMinRating(0)} label={t(locale, "companies_remove_filter")}>{ratingLabel(locale, RATINGS.find((r) => r.value === minRating)!)}</ActiveChip>
              )}
              <button onClick={clearAll} className="text-[13px] font-bold text-primary hover:underline">{t(locale, "common_clear_all")}</button>
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
        ) : list.length === 0 ? (
          <div className="bg-surface-container-lowest rounded-2xl shadow-bloom p-12 text-center">
            <span className="material-symbols-outlined text-outline/50 text-[48px] mb-3 block">search_off</span>
            <p className="font-bold text-[17px] text-on-surface mb-1">{t(locale, "companies_none_title")}</p>
            <p className="text-[14px] text-outline mb-5">{t(locale, "companies_none_sub")}</p>
            <button onClick={clearAll} className="inline-flex items-center gap-2 bg-primary text-on-primary px-5 py-2.5 rounded-xl font-bold text-[14px] touch-press">
              {t(locale, "companies_reset_filters")}
            </button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-gutter">
              {list.map((c, i) => (
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
                noun={t(locale, "common_company")}
                nounPlural={t(locale, "common_companies")}
              />
            )}
          </>
        )}
      </div>

      {/* ── Mobile filter sheet ── */}
      {sheetOpen && (
        <div className="md:hidden fixed inset-0 z-[60]" role="dialog" aria-modal>
          <div className="absolute inset-0 bg-on-background/40 backdrop-blur-sm" onClick={() => setSheetOpen(false)} />
          <div ref={sheetRef} onKeyDown={trapSheetTab} className="absolute bottom-0 left-0 right-0 bg-surface-container-lowest rounded-t-3xl p-5 pb-8 page-enter"
               style={{ paddingBottom: "max(2rem, env(safe-area-inset-bottom))" }}>
            <div className="w-10 h-1 bg-outline-variant/40 rounded-full mx-auto mb-5" />
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-black text-[19px] text-on-surface">{t(locale, "companies_filters_sort")}</h2>
              <button onClick={() => setSheetOpen(false)} className="p-1.5 rounded-full hover:bg-surface-container" aria-label={t(locale, "common_close")}>
                <span className="material-symbols-outlined text-outline">close</span>
              </button>
            </div>

            {/* Rating */}
            <p className="text-[12px] font-black uppercase tracking-wider text-outline mb-2.5">{t(locale, "companies_min_rating")}</p>
            <div className="grid grid-cols-4 gap-2 mb-6">
              {RATINGS.map((r) => (
                <button
                  key={r.value}
                  onClick={() => setMinRating(r.value)}
                  className={`py-2.5 rounded-xl text-[13px] font-bold border transition-colors
                    ${minRating === r.value ? "bg-primary text-on-primary border-primary" : "bg-surface-container border-transparent text-on-surface-variant"}`}
                >
                  {ratingLabel(locale, r)}
                </button>
              ))}
            </div>

            {/* Sort */}
            <p className="text-[12px] font-black uppercase tracking-wider text-outline mb-2.5">{t(locale, "companies_sort_by")}</p>
            <div className="space-y-2 mb-6">
              {SORTS.map((s) => (
                <button
                  key={s.key}
                  onClick={() => setSort(s.key)}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-[14px] font-bold border transition-colors
                    ${sort === s.key ? "bg-primary/8 text-primary border-primary/30" : "bg-surface-container border-transparent text-on-surface-variant"}`}
                >
                  {t(locale, s.labelKey)}
                  {sort === s.key && <span className="material-symbols-outlined text-[18px]">check</span>}
                </button>
              ))}
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button onClick={clearAll} className="flex-1 py-3.5 rounded-xl border border-outline-variant/40 font-bold text-[15px] text-on-surface touch-press">
                {t(locale, "common_reset")}
              </button>
              <button onClick={() => setSheetOpen(false)} className="flex-[2] py-3.5 rounded-xl bg-primary text-on-primary font-bold text-[15px] touch-press btn-press">
                {t(locale, "companies_show")} {total} {total === 1 ? t(locale, "companies_result") : t(locale, "companies_results")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Filter chip ──
function FilterChip({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon?: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex-shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[13px] font-bold transition-colors border whitespace-nowrap
        ${active
          ? "bg-primary text-on-primary border-primary"
          : "bg-surface-container-lowest text-on-surface-variant border-outline-variant/30 hover:border-outline-variant"}`}
    >
      {icon && <span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>{icon}</span>}
      {children}
    </button>
  );
}

// ── Active filter chip (removable) ──
function ActiveChip({ onRemove, children, label = "Remove filter" }: { onRemove: () => void; children: React.ReactNode; label?: string }) {
  return (
    <span className="flex items-center gap-1 bg-primary/10 text-primary px-2.5 py-1 rounded-full text-[12px] font-bold">
      {children}
      <button onClick={onRemove} className="hover:bg-primary/15 rounded-full -me-0.5" aria-label={label}>
        <span className="material-symbols-outlined text-[15px]">close</span>
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
          <img src={c.cover} alt={c.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" loading="lazy" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
          <div className="absolute bottom-0 left-5 rtl:left-auto rtl:right-5 translate-y-1/2 w-14 h-14 rounded-xl overflow-hidden border-2 border-white shadow-md bg-white">
            <img src={c.logo} alt={`${c.name} logo`} className="w-full h-full object-cover" loading="lazy" />
          </div>
          {/* Save heart — top-right (convention) */}
          <SaveButton slug={c.slug} className="absolute top-3 right-3 rtl:right-auto rtl:left-3" />
        </div>

        <div className="pt-9 px-5 pb-5 flex-grow flex flex-col">
          <div className="flex items-center gap-1.5 mb-0.5">
            <h3 className="font-bold text-[18px] text-on-surface group-hover:text-primary transition-colors">{c.name}</h3>
            {c.verified && (
              <span className="material-symbols-outlined text-primary text-[16px] flex-shrink-0" style={{ fontVariationSettings: "'FILL' 1" }} title="Verified">verified</span>
            )}
          </div>
          <p className="text-[13px] font-bold text-outline mb-2">{c.categoryLabel}</p>
          <div className="flex items-center gap-2 mb-3">
            <Stars n={Math.round(c.rating)} />
            <span className="font-bold text-[14px] text-on-surface">{c.rating}</span>
            <span className="text-outline text-[12px]">({c.reviewCount})</span>
          </div>
          <p className="text-[14px] text-on-surface-variant line-clamp-2 flex-grow leading-relaxed">{c.tagline}</p>
          <div className="mt-4 pt-4 border-t border-outline-variant/20 flex items-center justify-between">
            <span className="text-[12px] text-outline">{c.completedProjects} {t(locale, "common_projects")}</span>
            <span className="text-[14px] font-bold text-primary flex items-center gap-1 group-hover:translate-x-1 transition-transform">
              {t(locale, "common_view_profile")} <span className="material-symbols-outlined text-[16px] rtl-flip">arrow_forward</span>
            </span>
          </div>
        </div>
      </Link>
    </div>
  );
}
