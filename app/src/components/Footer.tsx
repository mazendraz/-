import { Link } from "react-router-dom";
import { useLocale } from "../context/LocaleContext";
import { t, type StringKey } from "../lib/i18n";
import { useCategoriesWithCounts } from "../lib/catalog";
import { useSettings } from "../lib/settings";

const PLATFORM_LINKS: { labelKey: StringKey; to: string }[] = [
  { labelKey: "footer_link_browse_services", to: "/services" },
  { labelKey: "footer_link_verified_companies", to: "/companies" },
  { labelKey: "footer_link_find_match", to: "/start" },
  { labelKey: "footer_link_saved", to: "/saved" },
];

const COMPANY_LINKS: { labelKey: StringKey; to: string }[] = [
  { labelKey: "footer_link_why", to: "/#about" },
  { labelKey: "footer_link_customer_reviews", to: "/#reviews" },
  { labelKey: "footer_link_how_it_works", to: "/#about" },
  { labelKey: "footer_link_contact", to: "/#contact" },
  { labelKey: "footer_link_my_requests", to: "/requests" },
  { labelKey: "footer_terms", to: "/terms" },
  { labelKey: "footer_privacy", to: "/privacy" },
];

export default function Footer() {
  const { locale } = useLocale();
  // Service-column links are derived from the live catalog, so renaming or
  // removing a category never leaves a dead/fallback link in the footer.
  const categories = useCategoriesWithCounts().slice(0, 4);
  // Contact details + social links are admin-managed (see lib/settings).
  const s = useSettings();
  const socials = [
    { label: "Facebook", url: s.social_facebook },
    { label: "Instagram", url: s.social_instagram },
    { label: "X", url: s.social_twitter },
    { label: "LinkedIn", url: s.social_linkedin },
  ].filter((x) => x.url.trim() !== "");

  return (
    <footer className="bg-inverse-surface text-inverse-on-surface pt-14 pb-24 md:pb-8 px-margin-mobile md:px-margin-desktop mt-stack-xl">
      <div className="max-w-container-max mx-auto">
        {/* Top row */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 pb-10 border-b border-white/10">
          {/* Brand */}
          <div id="contact">
            <Link to="/" className="text-headline-md font-headline-md font-black text-white tracking-tight block mb-3">
              {s.site_name || "Al Assema"}
            </Link>
            <p className="text-body-md font-body-md text-outline-variant leading-relaxed text-sm">
              {t(locale, "footer_copyright")}
            </p>

            {/* Contact details — render each only when set in admin settings */}
            {(s.support_email || s.public_phone || s.address) && (
              <ul className="mt-4 space-y-2">
                {s.support_email && (
                  <ContactLine icon="mail" href={`mailto:${s.support_email}`} text={s.support_email} />
                )}
                {s.public_phone && (
                  <ContactLine icon="call" href={`tel:${s.public_phone.replace(/\s/g, "")}`} text={s.public_phone} />
                )}
                {s.address && <ContactLine icon="location_on" text={s.address} />}
              </ul>
            )}

            {/* Social links */}
            {socials.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-3">
                {socials.map((x) => (
                  <a
                    key={x.label}
                    href={x.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[12px] font-bold text-inverse-on-surface/70 hover:text-white transition-colors"
                  >
                    {x.label}
                  </a>
                ))}
              </div>
            )}
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
          <p className="text-label-sm font-label-sm text-outline-variant text-center sm:text-start">
            © {new Date().getFullYear()} Al Assema. {t(locale, "footer_copyright")}
          </p>
        </div>
      </div>
    </footer>
  );
}

function ContactLine({ icon, text, href }: { icon: string; text: string; href?: string }) {
  const body = (
    <span className="flex items-center gap-2 text-sm text-inverse-on-surface/70">
      <span className="material-symbols-outlined text-[16px] flex-shrink-0">{icon}</span>
      <span className="break-words">{text}</span>
    </span>
  );
  return (
    <li>
      {href ? (
        <a href={href} className="hover:text-white transition-colors block">{body}</a>
      ) : (
        body
      )}
    </li>
  );
}

function FooterColumn({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-label-md font-label-md text-outline-variant uppercase tracking-widest mb-4 text-xs">
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
        className="text-body-md font-body-md text-inverse-on-surface/70 hover:text-white transition-colors text-sm"
      >
        {label}
      </Link>
    </li>
  );
}
