import { Link, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { useReveal } from "../hooks/useReveal";
import Stars from "../components/Stars";
import { useCategories, useCompanies, useCatalogStatus, type Company } from "../lib/catalog";
import { Skeleton } from "../components/Skeleton";
import CatalogError from "../components/CatalogError";
import LazyImage from "../components/LazyImage";
import SearchInput from "../components/SearchInput";
import Pagination from "../components/Pagination";
import { isApiConfigured } from "../lib/api";
import { useServerSearch } from "../hooks/useServerSearch";
import { usePageMeta } from "../hooks/usePageMeta";
import { useLocale } from "../context/LocaleContext";
import { t, tCount, type Locale } from "../lib/i18n";
import { formatRating } from "../lib/format";
import Icon from "../components/Icon";
import { useCustomerAuth } from "../lib/customerAuth";
import { recordCategoryView } from "../lib/categoryView";

export default function ServiceCategoryPage() {
  const { category } = useParams<{ category: string }>();
  const { locale } = useLocale();
  const { customer } = useCustomerAuth();
  const categories = useCategories();
  const allCompaniesRaw = useCompanies();
  const status = useCatalogStatus();
  const cat = category ? categories.find((c) => c.slug === category) : undefined;
  usePageMeta(
    cat?.metaTitle || `${cat ? `${cat.label} ${t(locale, "meta_category_suffix")}` : t(locale, "meta_services_title")} | ${t(locale, "brand_name")}`,
    cat?.metaDescription || cat?.description
  );
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();

  // Signed-in only (see recordCategoryView) — a guest's browsing has no
  // account to attach the signal to. Mirrors the mobile app's identical
  // effect in app/services/[slug].tsx.
  useEffect(() => {
    if (customer && category) recordCategoryView(category);
  }, [customer, category]);

  // Server-driven over the COMPLETE catalog (API mode); the client filter is the
  // demo (localStorage) path.
  const apiMode = isApiConfigured();
  const companySearch = useServerSearch<Company>(
    "/companies",
    query,
    { category: category || undefined },
    { pageSize: 12, enabled: apiMode },
  );

  const inCategory = category
    ? allCompaniesRaw.filter((c) => c.categories.some((cc) => cc.slug === category))
    : allCompaniesRaw;
  const filteredCompanies = inCategory.filter((c) => !q || [c.name, c.tagline, c.categoryLabel, ...c.services].some((v) => v.toLowerCase().includes(q)));

  const allCompanies = apiMode ? companySearch.data : filteredCompanies;
  const total = apiMode ? companySearch.total : filteredCompanies.length;
  const loadingEmpty = apiMode
    ? companySearch.loading && companySearch.data.length === 0
    : status === "loading" && allCompaniesRaw.length === 0;
  const errorEmpty = apiMode
    ? !!companySearch.error && companySearch.data.length === 0
    : status === "error" && allCompaniesRaw.length === 0;
  // Refetch (search/category change) with a previous page still on screen (CMP-03).
  const refetching = apiMode && companySearch.loading && !loadingEmpty;

  const headerRef = useReveal();

  return (
    <div className="bg-surface min-h-screen">
      {/* Page header */}
      <div className="bg-surface-container-lowest border-b border-surface-dim/30 pb-12 px-margin-mobile md:px-margin-desktop">
        <div className="max-w-container-max mx-auto">
          <div ref={headerRef} className="fade-up">
            <div className="flex items-center gap-2 text-label font-display text-outline mb-3">
              <Link to="/" className="hover:text-primary transition-colors">{t(locale, "nav_home")}</Link>
              <Icon name="chevron_right" className="text-body rtl-flip" />
              <Link to="/services" className="hover:text-primary transition-colors">{t(locale, "nav_services")}</Link>
              <Icon name="chevron_right" className="text-body rtl-flip" />
              <span className="text-on-surface">{cat?.label ?? t(locale, "category_all_companies")}</span>
            </div>

            <div className="flex items-start gap-4 flex-wrap">
              {cat && (
                <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <span className="material-symbols-outlined text-primary text-headline" style={{ fontVariationSettings: "'FILL' 1" }} aria-hidden="true" translate="no">{cat.icon}</span>
                </div>
              )}
              <div>
                <h1 className="text-headline md:text-display font-display text-on-surface mb-2">
                  {cat?.label ?? t(locale, "category_all_companies")}
                </h1>
                <p className="text-subhead text-outline max-w-2xl">
                  {cat?.description ?? t(locale, "category_browse_all_desc")}
                  {" "}— {total} {tCount(locale, "category_available_suffix", total)}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Companies list */}
      <div className="max-w-container-max mx-auto px-margin-mobile md:px-margin-desktop py-stack-xl">
        <div className="mb-6 max-w-md">
          <SearchInput value={query} onChange={setQuery} placeholder={t(locale, "search_category_companies_placeholder")} />
        </div>
        {loadingEmpty ? (
          <div className="space-y-6">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-44 md:h-48 rounded-2xl" />)}
          </div>
        ) : errorEmpty ? (
          <CatalogError onRetry={apiMode ? companySearch.refresh : undefined} />
        ) : allCompanies.length === 0 ? (
          <div className="text-center py-20" role="status" aria-live="polite" aria-atomic="true">
            <Icon name="search_off" className="text-outline text-[64px] mb-4 block" />
            <p className="text-subhead text-outline">
              {q ? `${t(locale, "common_no_results_for")} "${query}".` : t(locale, "category_none_yet")}
            </p>
            {q ? (
              <button onClick={() => setQuery("")} className="mt-4 inline-flex items-center text-primary font-display text-label hover:underline">
                {t(locale, "search_clear")}
              </button>
            ) : (
              <Link to="/services" className="mt-4 inline-flex items-center text-primary font-display text-label hover:underline">
                <Icon name="arrow_back" className="text-subhead rtl-flip" /> {t(locale, "category_browse_all")}
              </Link>
            )}
          </div>
        ) : (
          <>
            <div className={`space-y-6 transition-opacity ${refetching ? "opacity-60 pointer-events-none" : ""}`} aria-busy={refetching}>
              {allCompanies.map((c, i) => (
                <CompanyRow key={c.id} company={c} delay={Math.min(i, 6) * 80} locale={locale} />
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
    </div>
  );
}

function CompanyRow({ company: c, delay, locale }: { company: Company; delay: number; locale: Locale }) {
  const ref = useReveal();
  return (
    <div ref={ref} className="fade-up" style={{ transitionDelay: `${delay}ms` }}>
      <Link
        to={`/companies/${c.slug}`}
        className="group bg-surface-container-lowest rounded-2xl overflow-hidden shadow-bloom shadow-bloom-hover flex flex-col md:flex-row"
      >
        {/* Cover */}
        <div className="relative w-full md:w-64 h-48 md:h-auto flex-shrink-0 overflow-hidden">
          <LazyImage src={c.cover} alt={c.name} wrapperClassName="absolute inset-0 w-full h-full" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-slow" width={256} height={192} />
          <div className="absolute inset-0 bg-gradient-to-b md:bg-gradient-to-r from-transparent to-black/30" />
          {c.verified && (
            <div className="absolute top-3 right-3 rtl:right-auto rtl:left-3 flex items-center gap-1 bg-white/90 backdrop-blur-sm px-2 py-1 rounded-full shadow-sm">
              <Icon name="verified" className="text-primary text-label" style={{ fontVariationSettings: "'FILL' 1" }} />
              <span className="text-caption font-display text-primary">{t(locale, "common_verified")}</span>
            </div>
          )}
        </div>

        {/* Logo + info */}
        <div className="flex-grow flex flex-col md:flex-row items-start gap-5 p-6">
          {/* Logo */}
          <div className="w-16 h-16 rounded-xl overflow-hidden border-2 border-surface-container-high shadow-md flex-shrink-0 bg-white hidden md:block">
            <img src={c.logo} alt={`${c.name} logo`} className="w-full h-full object-cover" width={64} height={64} />
          </div>

          {/* Details */}
          <div className="flex-grow">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h2 className="font-display text-title text-on-surface group-hover:text-primary transition-colors mb-1">{c.name}</h2>
                <p className="text-label font-display text-outline mb-2">{c.categoryLabel}</p>
              </div>
              {/* `flex` and `hidden` both set `display`, so which one applied
                  depended on the order Tailwind happened to emit them in, not
                  on anything written here. The leading `flex` was dead — the
                  intent is "hidden on phones, flex from sm up" — so it is gone
                  rather than left as a coin-toss the next Tailwind upgrade
                  could flip. */}
              <span className="text-label font-display text-primary items-center gap-1 whitespace-nowrap group-hover:translate-x-1 rtl:group-hover:-translate-x-1 transition-transform hidden sm:flex">
                {t(locale, "common_view_profile")} <Icon name="arrow_forward" className="text-subhead rtl-flip" />
              </span>
            </div>

            <div className="flex items-center gap-3 mb-3 flex-wrap">
              <Stars n={Math.round(c.rating)} />
              <span className="font-display text-label text-on-surface">{formatRating(locale, c.rating)}</span>
              <span className="text-outline text-caption">({c.reviewCount} {t(locale, "common_reviews")})</span>
              <span className="text-outline text-caption">·</span>
              <span className="text-outline text-caption">{c.completedProjects} {tCount(locale, "noun_project", c.completedProjects)}</span>
            </div>

            <p className="text-on-surface-variant text-sm leading-relaxed mb-4 line-clamp-2">{c.tagline}</p>

            {/* Services tags */}
            <div className="flex flex-wrap gap-2">
              {c.services.slice(0, 4).map((s) => (
                <span key={s} className="text-caption font-display text-on-surface-variant bg-surface-container px-3 py-1 rounded-full border border-outline-variant/20">{s}</span>
              ))}
              {c.services.length > 4 && (
                <span className="text-caption font-display text-outline px-3 py-1 rounded-full bg-surface-container">+{c.services.length - 4} {t(locale, "category_more")}</span>
              )}
            </div>
          </div>
        </div>
      </Link>
    </div>
  );
}
