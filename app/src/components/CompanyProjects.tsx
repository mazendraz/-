import { useState } from "react";
import { Link } from "react-router-dom";
import { useLocale } from "../context/LocaleContext";
import { t } from "../lib/i18n";
import LazyImage from "./LazyImage";
import PricingCTA from "./PricingCTA";
import Icon from "./Icon";
import type { Project, CategoryPricingMode } from "../lib/data";

/**
 * The company profile's Projects section — a desktop sidebar+detail split
 * (select a project on the left, see it on the right, no page navigation)
 * that collapses to a single-open accordion on mobile. `services`/`location`
 * are the COMPANY's own fields, reused here as "Services performed"/
 * "Location" for each project — the `Project` type has no per-project
 * equivalent, and adding one would touch the schema for a page that was
 * explicitly asked to reuse existing data wherever possible.
 */
export default function CompanyProjects({
  projects, services, location, busy, requestHref, pricingMode, companyName,
}: {
  projects: Project[];
  services: string[];
  location: string;
  /** Only changes the CTA's wording and colour — both go to the same form. */
  busy: boolean;
  requestHref: string;
  pricingMode: CategoryPricingMode | undefined;
  companyName: string;
}) {
  const { locale } = useLocale();
  const [selected, setSelected] = useState(0);
  const [openMobile, setOpenMobile] = useState<number | null>(0);

  if (projects.length === 0) return null;

  const active = projects[selected] ?? projects[0];

  return (
    <>
      <h2 className="font-display text-title text-on-surface mb-6">
        {t(locale, "profile_projects_count")} ({projects.length})
      </h2>

      {/* Desktop: vertical list + detail panel */}
      <div className="hidden lg:flex lg:gap-8">
        <div className="w-80 flex-shrink-0 space-y-1.5 max-h-[520px] overflow-y-auto">
          {projects.map((p, i) => (
            <button
              key={p.title + i}
              type="button"
              onClick={() => setSelected(i)}
              className={`w-full flex items-center gap-3 p-2.5 rounded-xl text-start border transition-colors ${
                i === selected
                  ? "bg-primary/8 border-primary"
                  : "border-transparent hover:bg-surface-container"
              }`}
            >
              <div className="w-14 h-14 rounded-lg overflow-hidden flex-shrink-0">
                <LazyImage src={p.img} alt={p.title} wrapperClassName="w-full h-full" className="w-full h-full object-cover" />
              </div>
              <div className="min-w-0">
                <p className="font-bold text-label text-on-surface truncate">{p.title}</p>
                <p className="text-caption text-outline">{p.year}</p>
              </div>
            </button>
          ))}
        </div>

        <div key={active.title} className="flex-1 min-w-0 page-enter">
          <div className="rounded-2xl overflow-hidden shadow-bloom mb-5 h-80">
            <LazyImage src={active.img} alt={active.title} wrapperClassName="w-full h-full" className="w-full h-full object-cover" />
          </div>
          <h3 className="font-display text-title text-on-surface mb-1">{active.title}</h3>
          <p className="text-caption text-outline mb-4">{active.year}</p>
          <p className="text-on-surface-variant leading-relaxed mb-5">{active.description}</p>
          {services.length > 0 && (
            <div className="mb-4">
              <p className="text-caption font-bold text-outline mb-2 ltr:uppercase ltr:tracking-wider">
                {t(locale, "profile_project_services_label")}
              </p>
              <div className="flex flex-wrap gap-2">
                {services.map((s) => (
                  <span key={s} className="flex items-center gap-1 bg-primary/8 text-primary px-2.5 py-1.5 rounded-lg text-caption font-bold">
                    <Icon name="check_circle" className="text-label" style={{ fontVariationSettings: "'FILL' 1" }} />
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}
          {location && (
            <div className="flex items-center gap-2 text-label text-on-surface-variant">
              <Icon name="location_on" className="text-outline" />
              {location}
            </div>
          )}
        </div>
      </div>

      {/* Mobile: single-open accordion */}
      <div className="lg:hidden space-y-3">
        {projects.map((p, i) => {
          const open = openMobile === i;
          return (
            <div key={p.title + i} className="bg-surface-container-lowest rounded-2xl shadow-bloom overflow-hidden">
              <button
                type="button"
                onClick={() => setOpenMobile(open ? null : i)}
                className="w-full flex items-center gap-3 p-4 text-start touch-press"
                aria-expanded={open}
              >
                <div className="w-14 h-14 rounded-lg overflow-hidden flex-shrink-0">
                  <LazyImage src={p.img} alt={p.title} wrapperClassName="w-full h-full" className="w-full h-full object-cover" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-label text-on-surface truncate">{p.title}</p>
                  <p className="text-caption text-outline">{p.year}</p>
                </div>
                <Icon name="expand_more" className={`text-outline transition-transform duration-base ${open ? "rotate-180" : ""}`} />
              </button>
              <div className={`grid transition-[grid-template-rows] duration-slow ease-out ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
                <div className="overflow-hidden">
                  <div className="px-4 pb-4 space-y-3">
                    <div className="rounded-xl overflow-hidden h-48">
                      <LazyImage src={p.img} alt={p.title} wrapperClassName="w-full h-full" className="w-full h-full object-cover" />
                    </div>
                    <p className="text-on-surface-variant leading-relaxed text-sm">{p.description}</p>
                    {services.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {services.map((s) => (
                          <span key={s} className="bg-primary/8 text-primary px-2 py-1 rounded-lg text-caption font-bold">{s}</span>
                        ))}
                      </div>
                    )}
                    {location && (
                      <div className="flex items-center gap-1.5 text-caption text-on-surface-variant">
                        <Icon name="location_on" className="text-label" />
                        {location}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom CTA */}
      <div className="mt-10 bg-surface-container-lowest rounded-2xl p-8 text-center shadow-bloom">
        <p className="text-subhead text-outline mb-4">{t(locale, "profile_like_what")} {companyName}.</p>
        {/* Busy goes to the SAME request form, which queues it on the waiting
            list instead of sending it (see RequestForm). This used to open a
            short "leave your name and number" modal — a different, smaller
            thing than what the customer came here to ask for. */}
        {busy ? (
          <Link
            to={requestHref}
            className="inline-flex items-center gap-2 bg-amber-500 text-white px-6 py-3 rounded-xl text-label hover:bg-amber-600 transition-colors shadow-bloom"
          >
            <Icon name="hourglass_top" className="text-title" />
            {t(locale, "waitlist_join_cta")}
          </Link>
        ) : (
          <PricingCTA
            pricingMode={pricingMode}
            requestHref={requestHref}
            className="inline-flex items-center gap-2 bg-primary text-on-primary px-6 py-3 rounded-xl font-display text-label hover:bg-primary-container transition-colors shadow-bloom"
            catalogIcon="send"
          >
            <Icon name="send" className="text-title" />
            {t(locale, "common_request_service")}
          </PricingCTA>
        )}
      </div>
    </>
  );
}
