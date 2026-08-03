import { Link } from "react-router-dom";
import { useLocale } from "../context/LocaleContext";
import { t, type StringKey } from "../lib/i18n";
import { useCategoriesWithCounts } from "../lib/catalog";
import { useSettings } from "../lib/settings";
import ContactInfo from "./ContactInfo";

const PLATFORM_LINKS: { labelKey: StringKey; to: string }[] = [
  { labelKey: "footer_link_browse_services", to: "/services" },
  { labelKey: "footer_link_verified_companies", to: "/companies" },
  { labelKey: "footer_link_find_match", to: "/start" },
  { labelKey: "footer_link_saved", to: "/saved" },
];

// NAV-07: `/about` and `/contact` are real, indexable routes now (see
// pages/About.tsx, pages/Contact.tsx) — React Router doesn't scroll to a
// `#hash` on its own and <ScrollRestoration /> was overriding whatever
// position the browser's native jump managed anyway, so these links only
// ever "worked" by accident, and only from the home page itself.
const COMPANY_LINKS: { labelKey: StringKey; to: string }[] = [
  { labelKey: "footer_link_why", to: "/about" },
  { labelKey: "footer_link_customer_reviews", to: "/#reviews" },
  { labelKey: "footer_link_how_it_works", to: "/about" },
  { labelKey: "footer_link_contact", to: "/contact" },
  { labelKey: "footer_link_my_requests", to: "/requests" },
  { labelKey: "footer_terms", to: "/terms" },
  { labelKey: "footer_privacy", to: "/privacy" },
];

export default function Footer() {
  const { locale } = useLocale();
  // Service-column links are derived from the live catalog, so renaming or
  // removing a category never leaves a dead/fallback link in the footer.
  const categories = useCategoriesWithCounts().slice(0, 4);
  const s = useSettings();

  return (
    <footer className="bg-inverse-surface text-inverse-on-surface pt-14 pb-24 md:pb-8 px-margin-mobile md:px-margin-desktop mt-stack-xl">
      <div className="max-w-container-max mx-auto">
        {/* Top row */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 pb-10 border-b border-white/10">
          {/* Brand */}
          <div>
            <Link to="/" className="text-title font-display font-black text-white tracking-tight block mb-3">
              {s.site_name || t(locale, "brand_name")}
            </Link>
            <p className="text-sm text-outline-variant leading-relaxed">
              {t(locale, "footer_copyright")}
            </p>
            <div className="mt-4">
              <ContactInfo tone="inverse" />
            </div>
          </div>

          {/* Platform */}
          <FooterColumn title={t(locale, "footer_platform")}>
            {PLATFORM_LINKS.map((l) => (
              <FooterLink key={l.labelKey} to={l.to} label={t(locale, l.labelKey)} />
            ))}
          </FooterColumn>

          {/* Services — from live catalog */}
          <FooterColumn title={t(locale, "nav_services")}>
            {categories.map((c) => (
              <FooterLink key={c.slug} to={`/services/${c.slug}`} label={c.label} />
            ))}
          </FooterColumn>

          {/* Company */}
          <FooterColumn title={t(locale, "footer_company")}>
            {COMPANY_LINKS.map((l) => (
              <FooterLink key={l.labelKey} to={l.to} label={t(locale, l.labelKey)} />
            ))}
          </FooterColumn>
        </div>

        {/* Bottom row */}
        <div className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-caption font-display text-outline-variant text-center sm:text-start">
            © {new Date().getFullYear()} {t(locale, "brand_name")}. {t(locale, "footer_copyright")}
          </p>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-label font-display text-outline-variant ltr:uppercase ltr:tracking-widest mb-4">
        {title}
      </h4>
      <ul className="space-y-2.5">{children}</ul>
    </div>
  );
}

function FooterLink({ to, label }: { to: string; label: string }) {
  return (
    <li>
      <Link
        to={to}
        className="block py-2 -my-2 text-sm text-inverse-on-surface/70 hover:text-white transition-colors"
      >
        {label}
      </Link>
    </li>
  );
}
