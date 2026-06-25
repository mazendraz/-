import { Link } from "react-router-dom";
import { usePageMeta } from "../hooks/usePageMeta";
import { useLocale } from "../context/LocaleContext";
import { t } from "../lib/i18n";

export default function NotFound() {
  usePageMeta("Page Not Found | Al Assema");
  const { locale } = useLocale();
  return (
    <div className="bg-surface min-h-screen flex items-center justify-center px-5 pt-20 pb-16">
      <div className="text-center max-w-md">
        <div className="w-20 h-20 rounded-full bg-primary/8 flex items-center justify-center mx-auto mb-6">
          <span className="material-symbols-outlined text-primary text-[44px]">explore_off</span>
        </div>
        <p className="font-black text-[64px] text-primary leading-none tracking-tight mb-2">404</p>
        <h1 className="font-black text-[22px] text-on-surface mb-2 tracking-tight">{t(locale, "nf_title")}</h1>
        <p className="text-[15px] text-outline mb-8 leading-relaxed">
          {t(locale, "nf_sub")}
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link to="/" className="bg-primary text-on-primary px-6 py-3.5 rounded-xl font-bold text-[15px] hover:bg-primary-container transition-colors touch-press btn-press">
            {t(locale, "common_back_to_home")}
          </Link>
          <Link to="/companies" className="bg-surface-container text-on-surface px-6 py-3.5 rounded-xl font-bold text-[15px] hover:bg-surface-container-high transition-colors touch-press">
            {t(locale, "common_browse_companies")}
          </Link>
        </div>
      </div>
    </div>
  );
}
