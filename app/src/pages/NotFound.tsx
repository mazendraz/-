import { Link } from "react-router-dom";
import { usePageMeta } from "../hooks/usePageMeta";
import { useLocale } from "../context/LocaleContext";
import { useCategoriesWithCounts } from "../lib/catalog";
import { t } from "../lib/i18n";
import Icon from "../components/Icon";

// NF-03: was two buttons and nothing else — no way to recover except "start
// over from Home". A handful of real category links gives an actual next step.
const POPULAR_COUNT = 4;

export default function NotFound() {
  const { locale } = useLocale();
  const categories = useCategoriesWithCounts();
  usePageMeta(`${t(locale, "nf_title")} | ${t(locale, "brand_name")}`, t(locale, "nf_sub"));
  return (
    <div className="bg-surface min-h-screen flex items-center justify-center px-5 pb-16">
      <div className="text-center max-w-md">
        <div className="w-20 h-20 rounded-full bg-primary/8 flex items-center justify-center mx-auto mb-6">
          <Icon name="explore_off" className="text-primary text-[44px]" />
        </div>
        <p className="font-black text-[64px] text-primary leading-none tracking-tight mb-2">404</p>
        <h1 className="font-black text-title text-on-surface mb-2 tracking-tight">{t(locale, "nf_title")}</h1>
        <p className="text-body text-outline mb-8 leading-relaxed">
          {t(locale, "nf_sub")}
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link to="/" className="bg-primary text-on-primary px-6 py-3.5 rounded-xl font-bold text-body hover:bg-primary-container transition-colors touch-press btn-press">
            {t(locale, "common_back_to_home")}
          </Link>
          <Link to="/companies" className="bg-surface-container text-on-surface px-6 py-3.5 rounded-xl font-bold text-body hover:bg-surface-container-high transition-colors touch-press">
            {t(locale, "common_browse_companies")}
          </Link>
        </div>

        {categories.length > 0 && (
          <div className="mt-10 pt-8 border-t border-outline-variant/20">
            <p className="text-caption font-black ltr:uppercase ltr:tracking-wider text-outline mb-4">
              {t(locale, "nf_popular_categories")}
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {categories.slice(0, POPULAR_COUNT).map((cat) => (
                <Link
                  key={cat.slug}
                  to={`/services/${cat.slug}`}
                  className="flex items-center gap-1.5 bg-surface-container-lowest border border-outline-variant/30 px-3.5 py-2 rounded-full text-label font-bold text-on-surface hover:border-primary/40 hover:text-primary transition-colors"
                >
                  <Icon name={cat.icon} className="text-label" />
                  {cat.label}
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
