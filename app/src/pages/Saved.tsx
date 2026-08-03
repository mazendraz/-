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
import Icon from "../components/Icon";
import EmptyState from "../components/EmptyState";

export default function Saved() {
  const { slugs } = useSaved();
  const { locale } = useLocale();
  usePageMeta(`${t(locale, "footer_link_saved")} | ${t(locale, "brand_name")}`, t(locale, "saved_sub"));
  const [query, setQuery] = useState("");
  const saved = slugs.map(getCompany).filter(Boolean);
  const q = query.trim().toLowerCase();
  const companies = saved.filter((c) => !q || [c!.name, c!.categoryLabel].some((v) => v.toLowerCase().includes(q)));

  return (
    <div className="bg-surface min-h-screen pb-16">
      <div className="max-w-2xl mx-auto px-5">
        {/* Header */}
        <PersonalTabs active="saved" />
        <div className="mb-7">
          <h1 className="font-black text-headline md:text-display text-on-surface tracking-tight mb-1">{t(locale, "saved_title")}</h1>
          <p className="text-label text-outline">
            {t(locale, "saved_sub")}
          </p>
        </div>

        {saved.length > 0 && (
          <div className="mb-5">
            <SearchInput value={query} onChange={setQuery} placeholder={t(locale, "search_saved_placeholder")} />
          </div>
        )}

        {saved.length === 0 ? (
          <div className="bg-surface-container-lowest rounded-2xl shadow-bloom">
            <EmptyState
              icon="favorite"
              tone="error"
              title={t(locale, "saved_empty_title")}
              msg={t(locale, "saved_empty_sub")}
              actionHref={{ label: t(locale, "common_browse_companies"), to: "/companies" }}
            />
          </div>
        ) : companies.length === 0 ? (
          <div className="text-center py-12" role="status" aria-live="polite" aria-atomic="true">
            <Icon name="search_off" className="text-outline/50 text-[40px] mb-2 block" />
            <p className="text-label text-outline">{t(locale, "common_no_results_for")} "{query}".</p>
          </div>
        ) : (
          <div className="space-y-3">
            {companies.map((c) => (
              <div key={c!.slug} className="bg-surface-container-lowest rounded-2xl shadow-bloom card-lift overflow-hidden">
                <div className="flex items-center gap-3 p-3.5">
                  <Link to={`/companies/${c!.slug}`} className="flex-shrink-0">
                    <img src={c!.logo} alt={c!.name} className="w-14 h-14 rounded-xl object-cover border border-outline-variant/20" loading="lazy" width={56} height={56} />
                  </Link>
                  <Link to={`/companies/${c!.slug}`} className="flex-1 min-w-0 group">
                    <p className="font-bold text-body text-on-surface group-hover:text-primary transition-colors truncate">{c!.name}</p>
                    <p className="text-caption text-outline mb-1 truncate">{c!.categoryLabel}</p>
                    <div className="flex items-center gap-1.5">
                      <Stars n={Math.round(c!.rating)} />
                      <span className="text-caption font-bold text-on-surface">{c!.rating}</span>
                      <span className="text-caption text-outline">({c!.reviewCount})</span>
                    </div>
                  </Link>
                  <div className="flex flex-col items-center gap-2 flex-shrink-0">
                    <SaveButton slug={c!.slug} />
                    <Link
                      to={`/request?company=${c!.slug}&companyName=${encodeURIComponent(c!.name)}`}
                      className="bg-primary text-on-primary text-caption font-bold px-3.5 py-2 rounded-lg hover:bg-primary-container transition-colors touch-press"
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
