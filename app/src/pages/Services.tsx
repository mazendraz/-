import { Link } from "react-router-dom";
import { useState } from "react";
import { useReveal } from "../hooks/useReveal";
import { useCategoriesWithCounts } from "../lib/catalog";
import LazyImage from "../components/LazyImage";
import SearchInput from "../components/SearchInput";
import { usePageMeta } from "../hooks/usePageMeta";
import { useLocale } from "../context/LocaleContext";
import { t } from "../lib/i18n";

function FadeCard({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const ref = useReveal();
  return (
    <div ref={ref} className="fade-up" style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

export default function Services() {
  const heroRef = useReveal();
  usePageMeta("Services | Al Assema", "Browse all service categories in Egypt's New Administrative Capital. Every company is manually vetted.");
  const { locale } = useLocale();
  const allCategories = useCategoriesWithCounts();
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();
  const SERVICE_CATEGORIES = allCategories.filter(
    (c) => !q || [c.label, c.description].some((v) => v.toLowerCase().includes(q))
  );

  return (
    <div className="bg-surface min-h-screen">
      {/* Page header */}
      <div className="bg-surface-container-lowest border-b border-surface-dim/30 pt-28 pb-12 px-margin-mobile md:px-margin-desktop">
        <div className="max-w-container-max mx-auto">
          <div ref={heroRef} className="fade-up">
            <div className="flex items-center gap-2 text-label-md font-label-md text-outline mb-3">
              <Link to="/" className="hover:text-primary transition-colors">{t(locale, "nav_home")}</Link>
              <span className="material-symbols-outlined text-[16px] rtl-flip">chevron_right</span>
              <span className="text-on-surface">{t(locale, "nav_services")}</span>
            </div>
            <h1 className="text-headline-lg-mobile md:text-headline-lg font-headline-lg text-on-surface mb-2">
              {t(locale, "services_title")}
            </h1>
            <p className="text-body-lg font-body-lg text-outline max-w-2xl mb-5">
              {t(locale, "services_sub")}
            </p>
            <SearchInput value={query} onChange={setQuery} placeholder={t(locale, "search_categories_placeholder")} className="max-w-md" />
          </div>
        </div>
      </div>

      {/* Grid */}
      <div className="max-w-container-max mx-auto px-margin-mobile md:px-margin-desktop py-stack-xl">
        {SERVICE_CATEGORIES.length === 0 ? (
          <div className="text-center py-16">
            <span className="material-symbols-outlined text-outline/50 text-[48px] mb-3 block">search_off</span>
            <p className="text-[15px] text-outline">{t(locale, "common_no_results_for")} "{query}".</p>
          </div>
        ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-gutter">
          {SERVICE_CATEGORIES.map((cat, i) => (
            <FadeCard key={cat.slug} delay={i * 60}>
              <Link
                to={`/services/${cat.slug}`}
                className="group bg-surface-container-lowest rounded-2xl overflow-hidden shadow-bloom shadow-bloom-hover transition-all-spring block"
              >
                {/* Cover image */}
                <div className="relative h-48 overflow-hidden">
                  <LazyImage
                    src={cat.cover}
                    alt={cat.label}
                    wrapperClassName="absolute inset-0"
                    className="w-full h-full object-cover group-hover:scale-[1.05] transition-transform duration-300 ease-out"
                  />
                  {/* Premium scrim — bottom always darker than top */}
                  <div className="absolute inset-0 card-scrim" />
                  <div className="absolute inset-0 card-scrim-hover" />
                  {/* Glass icon circle */}
                  <div className="absolute top-3 right-3 rtl:right-auto rtl:left-3 bg-white/15 backdrop-blur-md border border-white/25 rounded-full p-2 shadow-lg">
                    <span
                      className="material-symbols-outlined text-white text-[22px] block"
                      style={{ fontVariationSettings: "'FILL' 1" }}
                    >
                      {cat.icon}
                    </span>
                  </div>
                  <div className="absolute bottom-4 left-4 rtl:left-auto rtl:right-4">
                    <span className="text-white/85 text-[13px] font-medium text-shadow-soft">{cat.count} {t(locale, "common_companies")}</span>
                  </div>
                </div>

                {/* Body */}
                <div className="p-5">
                  <h2 className="font-headline-md text-headline-md text-on-surface mb-1 group-hover:text-primary transition-colors">
                    {cat.label}
                  </h2>
                  <p className="text-body-md font-body-md text-on-surface-variant text-sm leading-relaxed mb-4">
                    {cat.description}
                  </p>
                  <div className="flex items-center justify-between">
                    <span className="text-label-sm font-label-sm text-outline bg-surface-container px-3 py-1 rounded-full">
                      {cat.count} {t(locale, "services_verified_companies")}
                    </span>
                    <span className="text-primary font-label-md text-label-md flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                      {t(locale, "common_explore")} <span className="material-symbols-outlined text-[16px] rtl-flip">arrow_forward</span>
                    </span>
                  </div>
                </div>
              </Link>
            </FadeCard>
          ))}
        </div>
        )}
      </div>
    </div>
  );
}
