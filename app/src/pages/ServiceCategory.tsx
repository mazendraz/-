import { Link, useParams } from "react-router-dom";
import { useState } from "react";
import { useReveal } from "../hooks/useReveal";
import Stars from "../components/Stars";
import { useCategories, useCompanies, useCatalogStatus, type Company } from "../lib/catalog";
import { Skeleton } from "../components/Skeleton";
import CatalogError from "../components/CatalogError";
import LazyImage from "../components/LazyImage";
import SearchInput from "../components/SearchInput";
import { usePageMeta } from "../hooks/usePageMeta";
import { useLocale } from "../context/LocaleContext";
import { t, type Locale } from "../lib/i18n";

export default function ServiceCategoryPage() {
  const { category } = useParams<{ category: string }>();
  const { locale } = useLocale();
  const categories = useCategories();
  const allCompaniesRaw = useCompanies();
  const status = useCatalogStatus();
  const cat = category ? categories.find((c) => c.slug === category) : undefined;
  usePageMeta(
    cat ? `${cat.label} in New Capital | Al Assema` : "Services | Al Assema",
    cat?.description
  );
  const [query, setQuery] = useState("");
  const inCategory = category ? allCompaniesRaw.filter((c) => c.category === category) : allCompaniesRaw;
  const q = query.trim().toLowerCase();
  const allCompanies = inCategory.filter((c) => !q || [c.name, c.tagline, c.categoryLabel, ...c.services].some((v) => v.toLowerCase().includes(q)));
  const loadingEmpty = status === "loading" && allCompaniesRaw.length === 0;
  const errorEmpty = status === "error" && allCompaniesRaw.length === 0;

  const headerRef = useReveal();

  return (
    <div className="bg-surface min-h-screen">
      {/* Page header */}
      <div className="bg-surface-container-lowest border-b border-surface-dim/30 pt-28 pb-12 px-margin-mobile md:px-margin-desktop">
        <div className="max-w-container-max mx-auto">
          <div ref={headerRef} className="fade-up">
            <div className="flex items-center gap-2 text-label-md font-label-md text-outline mb-3">
              <Link to="/" className="hover:text-primary transition-colors">{t(locale, "nav_home")}</Link>
              <span className="material-symbols-outlined text-[16px] rtl-flip">chevron_right</span>
              <Link to="/services" className="hover:text-primary transition-colors">{t(locale, "nav_services")}</Link>
              <span className="material-symbols-outlined text-[16px] rtl-flip">chevron_right</span>
              <span className="text-on-surface">{cat?.label ?? t(locale, "category_all_companies")}</span>
            </div>

            <div className="flex items-start gap-4 flex-wrap">
              {cat && (
                <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <span className="material-symbols-outlined text-primary text-[28px]" style={{ fontVariationSettings: "'FILL' 1" }}>{cat.icon}</span>
                </div>
              )}
              <div>
                <h1 className="text-headline-lg-mobile md:text-headline-lg font-headline-lg text-on-surface mb-2">
                  {cat?.label ?? t(locale, "category_all_companies")}
                </h1>
                <p className="text-body-lg font-body-lg text-outline max-w-2xl">
                  {cat?.description ?? t(locale, "category_browse_all_desc")}
                  {" "}— {allCompanies.length} {allCompanies.length === 1 ? t(locale, "category_available_suffix_one") : t(locale, "category_available_suffix")}
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
          <CatalogError />
        ) : allCompanies.length === 0 ? (
          <div className="text-center py-20">
            <span className="material-symbols-outlined text-outline text-[64px] mb-4 block">search_off</span>
            <p className="text-body-lg font-body-lg text-outline">
              {q ? `${t(locale, "common_no_results_for")} "${query}".` : t(locale, "category_none_yet")}
            </p>
            <Link to="/services" className="mt-4 inline-flex items-center text-primary font-label-md text-label-md hover:underline">
              <span className="material-symbols-outlined text-[18px] rtl-flip">arrow_back</span> {t(locale, "category_browse_all")}
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            {allCompanies.map((c, i) => (
              <CompanyRow key={c.id} company={c} delay={i * 80} locale={locale} />
            ))}
          </div>
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
        className="group bg-surface-container-lowest rounded-2xl overflow-hidden shadow-bloom shadow-bloom-hover transition-all-spring flex flex-col md:flex-row"
      >
        {/* Cover */}
        <div className="relative w-full md:w-64 h-48 md:h-auto flex-shrink-0 overflow-hidden">
          <LazyImage src={c.cover} alt={c.name} wrapperClassName="absolute inset-0 w-full h-full" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
          <div className="absolute inset-0 bg-gradient-to-b md:bg-gradient-to-r from-transparent to-black/30" />
          {c.verified && (
            <div className="absolute top-3 right-3 rtl:right-auto rtl:left-3 flex items-center gap-1 bg-white/90 backdrop-blur-sm px-2 py-1 rounded-full shadow-sm">
              <span className="material-symbols-outlined text-primary text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>verified</span>
              <span className="text-label-sm font-label-sm text-primary">{t(locale, "common_verified")}</span>
            </div>
          )}
        </div>

        {/* Logo + info */}
        <div className="flex-grow flex flex-col md:flex-row items-start gap-5 p-6">
          {/* Logo */}
          <div className="w-16 h-16 rounded-xl overflow-hidden border-2 border-surface-container-high shadow-md flex-shrink-0 bg-white hidden md:block">
            <img src={c.logo} alt={`${c.name} logo`} className="w-full h-full object-cover" />
          </div>

          {/* Details */}
          <div className="flex-grow">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h2 className="font-headline-md text-headline-md text-on-surface group-hover:text-primary transition-colors mb-1">{c.name}</h2>
                <p className="text-label-md font-label-md text-outline mb-2">{c.categoryLabel}</p>
              </div>
              <span className="text-label-md font-label-md text-primary flex items-center gap-1 whitespace-nowrap group-hover:translate-x-1 transition-transform hidden sm:flex">
                {t(locale, "common_view_profile")} <span className="material-symbols-outlined text-[18px] rtl-flip">arrow_forward</span>
              </span>
            </div>

            <div className="flex items-center gap-3 mb-3 flex-wrap">
              <Stars n={Math.round(c.rating)} />
              <span className="font-label-md text-label-md text-on-surface">{c.rating}</span>
              <span className="text-outline text-label-sm">({c.reviewCount} {t(locale, "common_reviews")})</span>
              <span className="text-outline text-label-sm">·</span>
              <span className="text-outline text-label-sm">{c.completedProjects} {t(locale, "common_projects")}</span>
            </div>

            <p className="text-body-md font-body-md text-on-surface-variant text-sm leading-relaxed mb-4 line-clamp-2">{c.tagline}</p>

            {/* Services tags */}
            <div className="flex flex-wrap gap-2">
              {c.services.slice(0, 4).map((s) => (
                <span key={s} className="text-label-sm font-label-sm text-on-surface-variant bg-surface-container px-3 py-1 rounded-full border border-outline-variant/20">{s}</span>
              ))}
              {c.services.length > 4 && (
                <span className="text-label-sm font-label-sm text-outline px-3 py-1 rounded-full bg-surface-container">+{c.services.length - 4} {t(locale, "category_more")}</span>
              )}
            </div>
          </div>
        </div>
      </Link>
    </div>
  );
}
