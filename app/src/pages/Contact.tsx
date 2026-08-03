import { Link } from "react-router-dom";
import { usePageMeta } from "../hooks/usePageMeta";
import { useLocale } from "../context/LocaleContext";
import { t } from "../lib/i18n";
import { useSettings } from "../lib/settings";
import ContactInfo from "../components/ContactInfo";
import Icon from "../components/Icon";

// NAV-07: a real, indexable/shareable route for what used to be a `/#contact`
// hash link into the footer — same admin-managed details (ContactInfo), just
// reachable on its own instead of only "working" when you happened to already
// be scrolled to the bottom of the home page.
export default function Contact() {
  const { locale } = useLocale();
  const s = useSettings();
  usePageMeta(`${t(locale, "footer_link_contact")} | ${t(locale, "brand_name")}`, t(locale, "footer_copyright"));

  const hasDetails = !!(s.support_email || s.public_phone || s.address || s.social_facebook || s.social_instagram || s.social_twitter || s.social_linkedin);

  return (
    <div className="bg-surface min-h-screen pb-16 px-5">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-1.5 text-label font-bold text-outline mb-6 flex-wrap">
          <Link to="/" className="hover:text-primary transition-colors">{t(locale, "nav_home")}</Link>
          <Icon name="chevron_right" className="text-label rtl-flip" />
          <span className="text-on-surface">{t(locale, "footer_link_contact")}</span>
        </div>
        <h1 className="font-black text-headline md:text-display text-on-surface mb-6 tracking-tight">
          {t(locale, "footer_link_contact")}
        </h1>

        {hasDetails ? (
          <div className="bg-surface-container-lowest rounded-2xl p-6 shadow-bloom max-w-md">
            <ContactInfo tone="surface" />
          </div>
        ) : (
          <p className="text-body text-outline">{t(locale, "legal_unpublished")}</p>
        )}

        <div className="mt-10">
          <Link to="/request" className="bg-primary text-on-primary px-6 py-3.5 rounded-xl font-bold text-body hover:bg-primary-container transition-colors touch-press btn-press inline-block">
            {t(locale, "common_request_service")}
          </Link>
        </div>
      </div>
    </div>
  );
}
