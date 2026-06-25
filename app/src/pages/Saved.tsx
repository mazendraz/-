import { useState } from "react";
import { Link } from "react-router-dom";
import { useSaved } from "../hooks/useSaved";
import { getCompany } from "../lib/catalog";
import SaveButton from "../components/SaveButton";
import PersonalTabs from "../components/PersonalTabs";
import SearchInput from "../components/SearchInput";
import Stars from "../components/Stars";
import { usePageMeta } from "../hooks/usePageMeta";
import { useLocale } from "../context/LocaleContext";
import { t } from "../lib/i18n";

export default function Saved() {
  const { slugs } = useSaved();
  usePageMeta("Saved Companies | Al Assema", "Your shortlist of saved companies — stored on this device, no account needed.");
  const { locale } = useLocale();
  const [query, setQuery] = useState("");
  const saved = slugs.map(getCompany).filter(Boolean);
  const q = query.trim().toLowerCase();
  const companies = saved.filter((c) => !q || [c!.name, c!.categoryLabel].some((v) => v.toLowerCase().includes(q)));

  return (
    <div className="bg-surface min-h-screen pt-20 md:pt-24 pb-16">
      <div className="max-w-2xl mx-auto px-5">
        {/* Header */}
        <PersonalTabs active="saved" />
        <div className="mb-7">
          <h1 className="font-black text-[26px] md:text-headline-lg text-on-surface tracking-tight mb-1">{t(locale, "saved_title")}</h1>
          <p className="text-[14px] text-outline">
            {t(locale, "saved_sub")}
          </p>
        </div>

        {saved.length > 0 && (
          <div className="mb-5">
            <SearchInput value={query} onChange={setQuery} placeholder={t(locale, "search_saved_placeholder")} />
          </div>
        )}

        {saved.length === 0 ? (
          /* Empty state */
          <div className="bg-surface-container-lowest rounded-2xl shadow-bloom p-10 text-center">
            <div className="w-16 h-16 rounded-full bg-error/8 flex items-center justify-center mx-auto mb-4">
              <span className="material-symbols-outlined text-error text-[34px]">favorite</span>
            </div>
            <h2 className="font-bold text-[18px] text-on-surface mb-1.5">{t(locale, "saved_empty_title")}</h2>
            <p className="text-[14px] text-outline mb-6 max-w-xs mx-auto leading-relaxed">
              {t(locale, "saved_empty_sub")}
            </p>
            <Link to="/companies" className="inline-flex items-center gap-2 bg-primary text-on-primary px-6 py-3 rounded-xl font-bold text-[14px] touch-press btn-press">
              {t(locale, "common_browse_companies")}
            </Link>
          </div>
        ) : companies.length === 0 ? (
          <div className="text-center py-12">
            <span className="material-symbols-outlined text-outline/50 text-[40px] mb-2 block">search_off</span>
            <p className="text-[14px] text-outline">{t(locale, "common_no_results_for")} "{query}".</p>
          </div>
        ) : (
          <div className="space-y-3">
            {companies.map((c) => (
              <div key={c!.slug} className="bg-surface-container-lowest rounded-2xl shadow-bloom card-lift overflow-hidden">
                <div className="flex items-center gap-3 p-3.5">
                  <Link to={`/companies/${c!.slug}`} className="flex-shrink-0">
                    <img src={c!.logo} alt={c!.name} className="w-14 h-14 rounded-xl object-cover border border-outline-variant/20" loading="lazy" />
                  </Link>
                  <Link to={`/companies/${c!.slug}`} className="flex-1 min-w-0 group">
                    <p className="font-bold text-[16px] text-on-surface group-hover:text-primary transition-colors truncate">{c!.name}</p>
                    <p className="text-[12px] text-outline mb-1 truncate">{c!.categoryLabel}</p>
                    <div className="flex items-center gap-1.5">
                      <Stars n={Math.round(c!.rating)} />
                      <span className="text-[12px] font-bold text-on-surface">{c!.rating}</span>
                      <span className="text-[11px] text-outline">({c!.reviewCount})</span>
                    </div>
                  </Link>
                  <div className="flex flex-col items-center gap-2 flex-shrink-0">
                    <SaveButton slug={c!.slug} />
                    <Link
                      to={`/request?company=${c!.slug}&companyName=${encodeURIComponent(c!.name)}`}
                      className="bg-primary text-on-primary text-[12px] font-bold px-3.5 py-2 rounded-lg hover:bg-primary-container transition-colors touch-press"
                    >
                      {t(locale, "common_request")}
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
