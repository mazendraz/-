import { Link } from "react-router-dom";
import { usePageMeta } from "../hooks/usePageMeta";
import { useLocale } from "../context/LocaleContext";
import { t } from "../lib/i18n";
import Icon from "../components/Icon";

// NAV-07: a real, indexable/shareable route for what used to be a `/#about`
// hash link — reuses the same "Why <brand>" copy as the home page section
// (home_why_*), since the content itself hasn't changed, only its ability to
// be linked to directly from anywhere in the product.
const REASONS = [
  { icon: "verified_user", titleKey: "home_why_1_title", descKey: "home_why_1_desc" },
  { icon: "workspace_premium", titleKey: "home_why_2_title", descKey: "home_why_2_desc" },
  { icon: "bolt", titleKey: "home_why_3_title", descKey: "home_why_3_desc" },
  { icon: "support_agent", titleKey: "home_why_4_title", descKey: "home_why_4_desc" },
] as const;

export default function About() {
  const { locale } = useLocale();
  usePageMeta(`${t(locale, "footer_link_why")} | ${t(locale, "brand_name")}`, t(locale, "home_why_sub"));

  return (
    <div className="bg-surface min-h-screen pb-16 px-5">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-1.5 text-label font-bold text-outline mb-6 flex-wrap">
          <Link to="/" className="hover:text-primary transition-colors">{t(locale, "nav_home")}</Link>
          <Icon name="chevron_right" className="text-label rtl-flip" />
          <span className="text-on-surface">{t(locale, "footer_link_why")}</span>
        </div>
        <h1 className="font-black text-headline md:text-display text-on-surface mb-3 tracking-tight">
          {t(locale, "home_why_title")}
        </h1>
        <p className="text-body text-outline mb-10 leading-relaxed max-w-2xl">
          {t(locale, "home_why_sub")}
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-gutter">
          {REASONS.map((item) => (
            <div key={item.titleKey} className="bg-surface-container-lowest rounded-2xl p-6 shadow-bloom">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                <Icon name={item.icon} className="text-primary text-title" fill />
              </div>
              <h2 className="font-bold text-subhead text-on-surface mb-2 leading-snug">{t(locale, item.titleKey)}</h2>
              <p className="text-label text-on-surface-variant leading-relaxed">{t(locale, item.descKey)}</p>
            </div>
          ))}
        </div>

        <div className="mt-10 flex flex-col sm:flex-row gap-3">
          <Link to="/companies" className="bg-primary text-on-primary px-6 py-3.5 rounded-xl font-bold text-body hover:bg-primary-container transition-colors touch-press btn-press text-center">
            {t(locale, "common_view_companies")}
          </Link>
          <Link to="/contact" className="bg-surface-container text-on-surface px-6 py-3.5 rounded-xl font-bold text-body hover:bg-surface-container-high transition-colors touch-press text-center">
            {t(locale, "footer_link_contact")}
          </Link>
        </div>
      </div>
    </div>
  );
}
