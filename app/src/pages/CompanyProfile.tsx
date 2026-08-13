import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { useState, useEffect } from "react";
import { useReveal } from "../hooks/useReveal";
import Stars from "../components/Stars";
import OfferingCards from "../components/OfferingCards";
import PricingCTA, { PRICING_SECTION_ID } from "../components/PricingCTA";
import RequestBar, { RequestBarContent, deriveBasketSummary } from "../components/RequestBar";
import SectionNav from "../components/SectionNav";
import CompanyGallery from "../components/CompanyGallery";
import CompanyProjects from "../components/CompanyProjects";
import { useCompanyDetail, useCatalogStatus } from "../lib/catalog";
import { useCart } from "../lib/cart";
import LazyImage from "../components/LazyImage";
import CatalogError from "../components/CatalogError";
import SaveButton from "../components/SaveButton";
import { usePageMeta } from "../hooks/usePageMeta";
import { addFeedback, type FeedbackType } from "../lib/feedback";
import { isBusy, formatReopenDate, joinWaitlist, rememberMyWaitlistEntry, availabilityLabel, availableAgainAt } from "../lib/availability";
import Modal from "../components/Modal";
import { useLocale } from "../context/LocaleContext";
import { t, type Locale } from "../lib/i18n";
import { formatRating } from "../lib/format";
import Captcha from "../components/Captcha";
import { captchaConfigured } from "../lib/captcha";
import PhoneInput from "../components/PhoneInput";
import { isValidE164 } from "../lib/phone";
import Icon from "../components/Icon";
import Select from "../components/Select";

export default function CompanyProfile() {
  const { slug } = useParams<{ slug: string }>();
  const { locale } = useLocale();
  const navigate = useNavigate();
  const location = useLocation();
  const { company, loading: detailLoading } = useCompanyDetail(slug ?? "");
  const status = useCatalogStatus();
  const { items: basketItems } = useCart(slug ?? "");
  usePageMeta(
    company?.metaTitle || `${company ? company.name : t(locale, "meta_company_fallback_title")} | ${t(locale, "brand_name")}`,
    company?.metaDescription || company?.tagline
  );
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [waitlistOpen, setWaitlistOpen] = useState(false);

  const headerRef = useReveal(0.06);
  const aboutRef = useReveal(0.06);
  const galleryRef = useReveal(0.06);
  const projectsRef = useReveal(0.06);
  const reviewsRef = useReveal(0.06);
  const contactRef = useReveal(0.06);

  useEffect(() => {
    if (!company) return;
    const script = document.createElement("script");
    script.id = "ld-company";
    script.type = "application/ld+json";
    script.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "LocalBusiness",
      name: company.name,
      description: company.tagline,
      url: `https://alassema.com/companies/${company.slug}`,
      logo: company.logo,
      image: company.gallery,
      priceRange: "$$",
      areaServed: "New Administrative Capital, Egypt",
      // CP-10: address/telephone/openingHours are deliberately omitted — the
      // public company card never exposes them (leads go through the request
      // form, not direct contact), so there's no real value to put here.
      ...(company.reviewCount > 0 && {
        aggregateRating: {
          "@type": "AggregateRating",
          ratingValue: company.rating,
          reviewCount: company.reviewCount,
        },
      }),
    });
    document.head.appendChild(script);
    return () => { document.getElementById("ld-company")?.remove(); };
  }, [company?.slug]);

  if (!company) {
    // API mode: distinguish "still loading" and "backend unreachable" from a
    // genuine 404 so we don't flash "not found" while the catalog hydrates or the
    // by-slug detail fetch is still in flight (e.g. a deep link to a company that
    // isn't in the first page of the cached list).
    if (status === "loading" || detailLoading) {
      return (
        <div className="min-h-screen flex items-center justify-center pt-20">
          <div className="w-8 h-8 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
        </div>
      );
    }
    if (status === "error") {
      return (
        <div className="min-h-screen flex items-center justify-center pt-20 px-5">
          <CatalogError message={t(locale, "catalog_error_body_company")} />
        </div>
      );
    }
    return (
      <div className="min-h-screen flex items-center justify-center flex-col gap-4 pt-20">
        <Icon name="business_center" className="text-outline text-[64px]" />
        <p className="font-display text-title text-on-surface">{t(locale, "profile_not_found")}</p>
        <Link to="/companies" className="text-primary font-display text-label hover:underline inline-flex items-center gap-1">
          <Icon name="arrow_back" className="text-body rtl-flip" /> {t(locale, "profile_back_to_companies")}
        </Link>
      </div>
    );
  }

  // When the company is busy, the whole profile swaps its "Request Service" CTAs for
  // a "Join the waiting list" action (see requestOrWaitlistCTA usages below).
  const busy = isBusy(company);
  // Resolved across the manual switch AND any running scheduled window; null =
  // open-ended, which the copy below handles with its date-less wording.
  const backAt = availableAgainAt(company);
  const requestHref = `/request?company=${company.slug}&companyName=${encodeURIComponent(company.name)}`;
  // The discount is applied SERVER-side when the request is priced, so the
  // basket has to show it too — otherwise the running total reads higher than
  // what gets recorded, and the reason to add another item is invisible at
  // the moment the customer is deciding.
  const basketSummary = deriveBasketSummary(basketItems, company.offerings ?? [], company.bundleRules ?? []);

  const navItems = [
    { id: "about", label: t(locale, "profile_tab_overview") },
    { id: "gallery", label: t(locale, "profile_tab_gallery") },
    { id: "projects", label: t(locale, "profile_tab_projects") },
  ];

  return (
    <div className="bg-surface min-h-screen pb-36 md:pb-0">
      {/* Mobile sticky bar — sits directly above the bottom tab bar. Contextual:
          shows the basket total + "Continue" once something's been added,
          otherwise the usual Request/Waitlist CTA — CP-03 merges what used to
          be two stacked bars (this one plus RequestBar) into one, and PERF-04
          drops the blur (this already reads as solid at 96% opacity, so the
          blur was pure repaint cost with no visible difference). */}
      <div
        className="md:hidden fixed start-0 end-0 z-30 px-4 pt-2.5 pb-2.5 bg-white border-t border-outline-variant/25 shadow-[0_-8px_24px_-6px_rgba(0,0,0,0.08)] flex items-center gap-2.5"
        style={{ bottom: "calc(var(--bottom-nav-h) + env(safe-area-inset-bottom, 0px))" }}
      >
        <SaveButton slug={company.slug} className="!w-12 !h-12 flex-shrink-0 border border-outline-variant/30" />
        {busy ? (
          <button
            onClick={() => setWaitlistOpen(true)}
            className="flex-1 flex items-center justify-center gap-2 bg-amber-500 text-white
                       py-3.5 rounded-xl font-bold text-body shadow-bloom touch-press btn-press"
          >
            <Icon name="hourglass_top" className="text-title" />
            {t(locale, "waitlist_join_cta")}
          </button>
        ) : basketSummary ? (
          <RequestBarContent summary={basketSummary} requestHref={requestHref} />
        ) : (
          <PricingCTA
            pricingMode={company.categoryPricingMode}
            requestHref={requestHref}
            className="flex-1 flex items-center justify-center gap-2 bg-primary text-on-primary
                       py-3.5 rounded-xl font-bold text-body shadow-bloom touch-press btn-press"
            catalogIcon="send"
          >
            <Icon name="send" className="text-title" />
            {t(locale, "common_request_service")}
          </PricingCTA>
        )}
      </div>

      {/* Desktop-only floating basket summary — mobile gets the same content
          merged into the sticky bar above instead (see basketSummary). */}
      <RequestBar
        items={basketItems}
        offerings={company.offerings ?? []}
        bundleRules={company.bundleRules ?? []}
        requestHref={requestHref}
      />

      {/* Hero cover. RootLayout skips <main>'s nav-clearance padding on a
          company profile (see hasFullBleedHero) so this starts flush at the
          top of the viewport, behind the transparent nav, the same treatment
          as the homepage hero — one continuous image instead of a page that
          starts below a gap. hero-scrim (shared with Home) darkens the top
          enough to keep the nav's icons/text readable over any cover photo,
          not just this one's. */}
      <div className="relative w-full h-64 md:h-96 overflow-hidden">
        <LazyImage src={company.cover} alt={company.name} eager wrapperClassName="absolute inset-0" className="w-full h-full object-cover" width={1280} height={384} />
        <div className="absolute inset-0 hero-scrim" />
        {/* Back breadcrumb. CP-05: was a fixed top-20 (80px) that didn't track
            the nav's own height (64px mobile / 76px desktop) — clears the
            actual nav via the shared --nav-h token instead. */}
        <div className="absolute left-margin-mobile md:left-margin-desktop rtl:left-auto rtl:right-margin-mobile rtl:md:right-margin-desktop" style={{ top: "calc(var(--nav-h) + 12px)" }}>
          {/* CP-06: navigate(-1) on a fresh tab / external link leaves the
              site entirely — location.key is React Router's own signal for
              "no in-app history to go back to" (set to "default" on the
              initial entry). */}
          <button
            onClick={() => (location.key === "default" ? navigate("/companies") : navigate(-1))}
            className="flex items-center gap-2 text-white/80 hover:text-white transition-colors bg-white/10 backdrop-blur-sm px-3 py-1.5 rounded-full text-caption font-display"
          >
            <Icon name="arrow_back" className="text-body rtl-flip" /> {t(locale, "profile_back")}
          </button>
        </div>
      </div>

      {/* Identity bar */}
      <div className="bg-surface-container-lowest border-b border-surface-dim/30 relative z-10">
        <div className="max-w-container-max mx-auto px-margin-mobile md:px-margin-desktop">
          <div ref={headerRef} className="fade-up -mt-10 pb-6">
            <div className="flex flex-col sm:flex-row sm:items-end gap-4">
              {/* Logo */}
              <div className="w-20 h-20 rounded-2xl overflow-hidden border-4 border-white shadow-xl flex-shrink-0 bg-white">
                <LazyImage src={company.logo} alt={`${company.name} logo`} className="w-full h-full object-cover" width={80} height={80} />
              </div>

              {/* min-w-0: a flex item's min-width defaults to `auto`, i.e. its
                  CONTENT width, so this column refused to shrink below the
                  company name and pushed the action buttons beside it clean off
                  the viewport. Measured with a 500-character name at 768px: the
                  page scrolled to 825px and "Request a Service" sat outside it.
                  break-words then lets a name with no spaces wrap instead of
                  setting that content width in the first place. */}
              <div className="flex-grow min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <h1 className="text-headline md:text-display font-display text-on-surface break-words min-w-0">{company.name}</h1>
                  {company.verified && (
                    <span className="flex items-center gap-1 bg-primary/10 text-primary px-2 py-0.5 rounded-full text-caption font-display">
                      <Icon name="verified" className="text-label" style={{ fontVariationSettings: "'FILL' 1" }} /> {t(locale, "common_verified")}
                    </span>
                  )}
                  {/* Availability, stated quietly. An upcoming period is shown as
                      information — it must not discourage a request today. */}
                  <AvailabilityBadge company={company} locale={locale} />
                </div>
                <p className="text-label font-display text-outline mb-2">{company.categoryLabel}</p>
                <div className="flex items-center gap-3 flex-wrap">
                  <Stars n={Math.round(company.rating)} size="text-body" />
                  <span className="font-display text-label text-on-surface">{formatRating(locale, company.rating)}</span>
                  <span className="text-outline text-caption">({company.reviewCount} {t(locale, "common_reviews")})</span>
                  <span className="text-outline">·</span>
                  <span className="text-outline text-caption">{company.completedProjects} {t(locale, "profile_completed_projects")}</span>
                </div>
                {/* Trust pills */}
                <div className="flex items-center gap-2 flex-wrap mt-3">
                  <span className="flex items-center gap-1.5 bg-green-50 text-green-700 px-2.5 py-1 rounded-full text-caption font-bold">
                    <Icon name="bolt" className="text-label" />
                    {t(locale, "profile_responds")} {company.responseTime}
                  </span>
                  <span className="flex items-center gap-1.5 bg-surface-container text-on-surface-variant px-2.5 py-1 rounded-full text-caption font-bold">
                    <Icon name="workspace_premium" className="text-label" />
                    {company.yearsExperience} {t(locale, "profile_years_experience")}
                  </span>
                  <span className="flex items-center gap-1.5 bg-surface-container text-on-surface-variant px-2.5 py-1 rounded-full text-caption font-bold">
                    <Icon name="verified_user" className="text-label" />
                    {t(locale, "profile_verified_since")} {company.verifiedSince}
                  </span>
                </div>
              </div>

              {/* Request CTA — desktop only; mobile uses sticky bar */}
              <div className="hidden sm:flex sm:flex-shrink-0 mt-2 sm:mt-0 gap-2">
                <SaveButton slug={company.slug} variant="pill" />
                {busy ? (
                  <button
                    onClick={() => setWaitlistOpen(true)}
                    className="flex items-center justify-center gap-2 bg-amber-500 text-white px-6 py-3 rounded-xl
                               font-bold text-label hover:bg-amber-600 transition-colors shadow-bloom touch-press btn-press"
                  >
                    <Icon name="hourglass_top" className="text-title" />
                    {t(locale, "waitlist_join_cta")}
                  </button>
                ) : (
                  <PricingCTA
                    pricingMode={company.categoryPricingMode}
                    requestHref={requestHref}
                    className="flex items-center justify-center gap-2 bg-primary text-on-primary px-6 py-3 rounded-xl
                               font-bold text-label hover:bg-primary-container transition-colors shadow-bloom touch-press btn-press"
                    catalogIcon="send"
                  >
                    <Icon name="send" className="text-title" />
                    {t(locale, "common_request_service")}
                  </PricingCTA>
                )}
              </div>
            </div>

            {/* Busy banner */}
            {busy && (
              <div className="mt-4 flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
                <Icon name="event_busy" className="text-amber-600 text-title flex-shrink-0" style={{ fontVariationSettings: "'FILL' 1" }} />
                <div className="min-w-0">
                  <p className="font-bold text-label text-amber-900">
                    {backAt
                      ? `${t(locale, "busy_banner_booked_until")} ${formatReopenDate(backAt, locale)}`
                      : t(locale, "busy_banner_fully_booked")}
                  </p>
                  {company.busyNote
                    ? <p className="text-label text-amber-800 mt-0.5">{company.busyNote}</p>
                    : <p className="text-label text-amber-800 mt-0.5">{t(locale, "waitlist_modal_sub")}</p>}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Section nav — smooth-scrolls to each section below instead of
            switching what's mounted; stays sticky the whole way down. */}
        <SectionNav items={navItems} />
      </div>

      {/* ── One continuous scroll: About → Services → Gallery → Projects →
          Reviews → Contact. Each section reveals itself independently as it
          scrolls into view (useReveal + .fade-up), instead of one big
          all-at-once reveal. ── */}
      <div className="max-w-container-max mx-auto px-margin-mobile md:px-margin-desktop py-stack-xl space-y-16">
        {/* About */}
        <section id="about" ref={aboutRef} className="fade-up scroll-mt-20 md:scroll-mt-24">
          <h2 className="font-display text-title text-on-surface mb-4">{t(locale, "profile_about")} {company.name}</h2>
          <p className="text-subhead text-on-surface-variant leading-relaxed mb-6">{company.about}</p>
          {company.badges.length > 0 && (
            <div>
              <h3 className="font-bold text-caption text-outline mb-3 ltr:uppercase ltr:tracking-wider">{t(locale, "profile_credentials")}</h3>
              <div className="flex flex-wrap gap-2">
                {company.badges.map((b) => (
                  <span key={b} className="flex items-center gap-1 bg-primary/8 text-primary px-2.5 py-1.5 rounded-lg text-caption font-bold">
                    <Icon name="verified" className="text-label" style={{ fontVariationSettings: "'FILL' 1" }} />
                    {b}
                  </span>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Services — id/scroll-mt: PricingCTA scrolls here for a
            FIXED_CATALOG company instead of skipping to an empty form. */}
        <section id={PRICING_SECTION_ID} className="scroll-mt-20 md:scroll-mt-24 rounded-2xl">
          <OfferingCards
            offerings={company.offerings ?? []}
            services={company.services}
            companySlug={company.slug}
            requestHref={requestHref}
          />
          {/* The escape hatch for a request that isn't one of the priced
              cards above — a light-weight text link, not a button, so it
              never competes visually with the cards themselves. */}
          {company.categoryPricingMode === "FIXED_CATALOG" && (
            <Link
              to={requestHref}
              className="inline-flex items-center gap-1 mt-4 text-primary text-label font-bold hover:underline"
            >
              {t(locale, "profile_custom_request")}
              <Icon name="arrow_forward" className="text-body rtl-flip" />
            </Link>
          )}
        </section>

        {/* Gallery — auto-visible, no tab click required. */}
        <section id="gallery" ref={galleryRef} className="fade-up scroll-mt-20 md:scroll-mt-24">
          <CompanyGallery images={company.gallery} alt={company.name} />
        </section>

        {/* Projects — sidebar+detail on desktop, accordion on mobile. */}
        <section id="projects" ref={projectsRef} className="fade-up scroll-mt-20 md:scroll-mt-24">
          <CompanyProjects
            projects={company.projects}
            services={company.services}
            location={company.location}
            busy={busy}
            requestHref={requestHref}
            pricingMode={company.categoryPricingMode}
            companyName={company.name}
            onWaitlistOpen={() => setWaitlistOpen(true)}
          />
        </section>

        {/* Reviews — the SECTION wrapper always renders (so its useReveal ref
            attaches on first mount, matching Gallery/Projects above); only the
            content self-gates on empty. `company.reviews` starts as [] on the
            cached list card and is only populated once the full by-slug detail
            fetch lands — if the section itself were conditional on that
            length, it wouldn't exist in the DOM yet when useReveal's one-time
            IntersectionObserver effect runs, and would stay invisible forever
            once the data arrived on a later render. */}
        <section id="reviews" ref={reviewsRef} className="fade-up scroll-mt-20 md:scroll-mt-24 empty:hidden">
          {company.reviews.length > 0 && (
            <>
              <h2 className="font-display text-title text-on-surface mb-6">{t(locale, "profile_stat_reviews")}</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {company.reviews.map((r, i) => (
                  <div key={i} className="bg-surface-container-lowest rounded-2xl p-5 shadow-bloom">
                    <Stars n={r.rating} size="text-label" />
                    {/* A star-only review is valid — the price-verification
                        flow's review step labels the comment box "optional" and
                        submitReviewSchema accepts an empty string. Rendering it
                        unconditionally printed a bare pair of quote marks. */}
                    {r.text.trim() && (
                      <p className="text-label text-on-surface-variant leading-relaxed mt-3 mb-4">&ldquo;{r.text}&rdquo;</p>
                    )}
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center text-label flex-shrink-0">
                        {r.avatar}
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-caption text-on-surface flex items-center gap-1">
                          {r.author}
                          {r.verified && <Icon name="verified" className="text-primary text-label" style={{ fontVariationSettings: "'FILL' 1" }} />}
                        </p>
                        <p className="text-caption text-outline">{r.district}{r.date ? ` · ${r.date}` : ""}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>

        {/* Contact Information — closing section. Only fields already public
            elsewhere on the profile (location, response time, live
            availability) plus the existing Request/Waitlist CTA and the
            report-a-problem link — phone/whatsapp/email stay off the public
            profile, matching how the rest of the platform funnels contact
            through the lead-request form. */}
        <section id="contact" ref={contactRef} className="fade-up scroll-mt-20 md:scroll-mt-24">
          <h2 className="font-display text-title text-on-surface mb-6">{t(locale, "profile_contact_title")}</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="bg-surface-container-lowest rounded-2xl p-5 shadow-bloom space-y-4">
              <div className="flex items-center gap-3">
                <Icon name="location_on" className="text-primary text-title" fill />
                <div>
                  <p className="text-caption text-outline">{t(locale, "profile_stat_location")}</p>
                  <p className="text-label font-bold text-on-surface">{company.location}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Icon name="bolt" className="text-primary text-title" fill />
                <div>
                  <p className="text-caption text-outline">{t(locale, "profile_stat_response")}</p>
                  <p className="text-label font-bold text-on-surface">{company.responseTime}</p>
                </div>
              </div>
              <div className="pt-1">
                <AvailabilityBadge company={company} locale={locale} />
              </div>
              <button
                onClick={() => setFeedbackOpen(true)}
                className="w-full flex items-center gap-2.5 px-4 py-3 rounded-xl border border-error/30 text-error hover:bg-error/5 hover:border-error/50 transition-colors text-label font-bold"
              >
                <Icon name="report_problem" className="text-subhead" />
                {t(locale, "profile_report")}
              </button>
            </div>

            {/* CTA card */}
            {busy ? (
              <div className="bg-amber-500 rounded-2xl p-6 shadow-bloom text-white">
                <Icon name="hourglass_top" className="text-headline mb-2 block" style={{ fontVariationSettings: "'FILL' 1" }} />
                <h3 className="text-title mb-2">
                  {backAt
                    ? `${t(locale, "busy_available_again")} ${formatReopenDate(backAt, locale)}`
                    : t(locale, "busy_banner_fully_booked")}
                </h3>
                <p className="text-body opacity-90 mb-4">{t(locale, "waitlist_modal_sub")}</p>
                <button
                  onClick={() => setWaitlistOpen(true)}
                  className="block w-full text-center bg-white text-amber-700 text-label py-3 rounded-xl hover:bg-amber-50 transition-colors font-bold"
                >
                  {t(locale, "waitlist_join_cta")}
                </button>
              </div>
            ) : (
              <div className="bg-primary rounded-2xl p-6 shadow-bloom text-on-primary">
                <Icon name="handshake" className="text-headline mb-2 block" style={{ fontVariationSettings: "'FILL' 1" }} />
                <h3 className="font-display text-title mb-2">{t(locale, "profile_ready_title")}</h3>
                <p className="text-body opacity-90 mb-4">{t(locale, "profile_ready_sub")}</p>
                <PricingCTA
                  pricingMode={company.categoryPricingMode}
                  requestHref={requestHref}
                  className="block w-full text-center bg-white text-primary font-display text-label py-3 rounded-xl hover:bg-surface-container-low transition-colors font-bold"
                >
                  {t(locale, "profile_request_company")}
                </PricingCTA>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Feedback modal */}
      {feedbackOpen && (
        <FeedbackModal
          companySlug={company.slug}
          companyName={company.name}
          onClose={() => setFeedbackOpen(false)}
          locale={locale}
        />
      )}

      {/* Waiting-list modal */}
      {waitlistOpen && (
        <WaitlistModal
          companySlug={company.slug}
          companyName={company.name}
          services={company.services}
          onClose={() => setWaitlistOpen(false)}
          locale={locale}
        />
      )}
    </div>
  );
}

// ── Feedback modal ────────────────────────────────────────────────────────────
function FeedbackModal({ companySlug, companyName, onClose, locale }: {
  companySlug: string;
  companyName: string;
  onClose: () => void;
  locale: Locale;
}) {
  const [type, setType] = useState<FeedbackType>("problem");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [honeypot, setHoneypot] = useState(""); // bot trap — see hidden field below
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaReset, setCaptchaReset] = useState(0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim()) { setError(t(locale, "feedback_err")); return; }
    if (captchaConfigured() && !captchaToken) { setError(t(locale, "form_err_captcha")); return; }
    setIsSubmitting(true);
    setError("");
    try {
      await addFeedback(
        { type, name: name.trim(), phone: phone.trim(), companySlug, companyName, message: message.trim() },
        honeypot,
        captchaToken,
      );
      setSubmitted(true);
    } catch {
      // API mode surfaces real failures — don't fake success.
      setError(t(locale, "feedback_err_submit"));
      setCaptchaToken(null);
      setCaptchaReset((n) => n + 1);
      setIsSubmitting(false);
    }
  }

  const typeLabels: Record<FeedbackType, string> = {
    problem: t(locale, "feedback_problem"),
    suggestion: t(locale, "feedback_suggestion"),
    inquiry: t(locale, "feedback_inquiry"),
  };

  return (
    <Modal onClose={onClose} title={t(locale, "feedback_title")}>
        <div className="p-5">
          {submitted ? (
            <div className="text-center py-6">
              <Icon name="check_circle" className="text-primary text-[48px] mb-3 block" style={{ fontVariationSettings: "'FILL' 1" }} />
              <p className="font-bold text-subhead text-on-surface mb-1">{t(locale, "feedback_received")}</p>
              <p className="text-label text-outline mb-5">{t(locale, "feedback_received_sub")}</p>
              <button onClick={onClose} className="bg-primary text-on-primary px-6 py-2.5 rounded-xl font-bold text-label">{t(locale, "common_close")}</button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Type */}
              <div className="grid grid-cols-3 gap-2">
                {(["problem", "suggestion", "inquiry"] as FeedbackType[]).map((ft) => {
                  const icons: Record<FeedbackType, string> = { problem: "report_problem", suggestion: "lightbulb", inquiry: "help" };
                  return (
                    <button
                      key={ft} type="button"
                      onClick={() => setType(ft)}
                      className={`flex flex-col items-center gap-1 py-3 rounded-xl border text-caption font-bold transition-colors
                        ${type === ft ? "border-primary bg-primary/8 text-primary" : "border-outline-variant/30 text-outline hover:border-outline-variant/60"}`}
                    >
                      <span className="material-symbols-outlined text-title" aria-hidden="true" translate="no">{icons[ft]}</span>
                      {typeLabels[ft]}
                    </button>
                  );
                })}
              </div>

              {/* Regarding */}
              <div className="flex items-center gap-2 bg-surface-container rounded-xl px-3 py-2.5 text-label text-on-surface-variant">
                <Icon name="business" className="text-body text-outline" />
                {t(locale, "feedback_regarding")} <span className="font-bold text-on-surface ms-1">{companyName}</span>
              </div>

              {/* Name + Phone */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-caption font-bold text-on-surface mb-1">{t(locale, "feedback_your_name")}</label>
                  <input className="field-input !py-2 text-label" placeholder={t(locale, "feedback_optional")} value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div>
                  <label className="block text-caption font-bold text-on-surface mb-1">{t(locale, "feedback_phone")}</label>
                  <PhoneInput value={phone} onChange={setPhone} placeholder={t(locale, "feedback_optional")} />
                </div>
              </div>

              {/* Message */}
              <div>
                <label className="block text-caption font-bold text-on-surface mb-1">{t(locale, "feedback_message")} <span className="text-error">*</span></label>
                <textarea
                  className={`field-input resize-none ${error ? "error" : ""}`}
                  rows={4}
                  placeholder={t(locale, "feedback_message_ph")}
                  value={message}
                  onChange={(e) => { setMessage(e.target.value); if (error) setError(""); }}
                />
                {error && <p className="text-caption text-error font-bold mt-1">{error}</p>}
              </div>

              {/* CAPTCHA — renders only when VITE_TURNSTILE_SITE_KEY is set */}
              <Captcha onToken={setCaptchaToken} resetSignal={captchaReset} />

              <button
                type="submit"
                disabled={isSubmitting}
                className={`w-full bg-primary text-on-primary py-3 rounded-xl font-bold text-label transition-colors touch-press
                  ${isSubmitting ? "opacity-80 cursor-not-allowed" : "hover:bg-primary-container btn-press"}`}
              >
                {t(locale, "feedback_send")}
              </button>

              {/* Honeypot — hidden from real users; bots auto-fill it and the
                  server rejects the submission. Kept out of the tab order. The
                  data-*-ignore attrs stop password managers (1Password/LastPass/
                  Bitwarden) from autofilling it, which would falsely flag a real user. */}
              <input
                type="text"
                name="hp_field"
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                data-1p-ignore="true"
                data-lpignore="true"
                data-bwignore="true"
                data-form-type="other"
                value={honeypot}
                onChange={(e) => setHoneypot(e.target.value)}
                className="sr-only"
              />
            </form>
          )}
        </div>
    </Modal>
  );
}

// ── Waiting-list modal ────────────────────────────────────────────────────────
// Shown when a busy company's "Join the waiting list" CTA is tapped. Mirrors the
// FeedbackModal (honeypot + CAPTCHA + focus trap); on success the customer is queued
// and the company contacts them off-platform.
function WaitlistModal({ companySlug, companyName, services, onClose, locale }: {
  companySlug: string;
  companyName: string;
  services: string[];
  onClose: () => void;
  locale: Locale;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [service, setService] = useState("");
  const [note, setNote] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [honeypot, setHoneypot] = useState("");
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaReset, setCaptchaReset] = useState(0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (name.trim().length < 2) { setError(t(locale, "waitlist_err_name")); return; }
    if (!isValidE164(phone)) { setError(t(locale, "waitlist_err_phone")); return; }
    if (captchaConfigured() && !captchaToken) { setError(t(locale, "form_err_captcha")); return; }
    setIsSubmitting(true);
    setError("");
    try {
      const entry = await joinWaitlist(
        companySlug,
        { name: name.trim(), phone: phone.trim(), service: service.trim(), note: note.trim() },
        honeypot,
        captchaToken,
      );
      // Remember it on this device so it shows up in "My Requests" — mirrors how
      // a submitted lead is remembered. Null in demo mode (nothing to track).
      if (entry) rememberMyWaitlistEntry(entry);
      setSubmitted(true);
    } catch {
      setError(t(locale, "waitlist_err_submit"));
      setCaptchaToken(null);
      setCaptchaReset((n) => n + 1);
      setIsSubmitting(false);
    }
  }

  return (
    <Modal
      onClose={onClose}
      title={
        <>
          <Icon name="hourglass_top" className="text-amber-500 text-title" style={{ fontVariationSettings: "'FILL' 1" }} />
          {t(locale, "waitlist_modal_title")}
        </>
      }
    >
        <div className="p-5">
          {submitted ? (
            <div className="text-center py-6">
              <Icon name="check_circle" className="text-green-600 text-[48px] mb-3 block" style={{ fontVariationSettings: "'FILL' 1" }} />
              <p className="font-bold text-subhead text-on-surface mb-1">{t(locale, "waitlist_success")}</p>
              <p className="text-label text-outline mb-5">{t(locale, "waitlist_success_sub")}</p>
              <button onClick={onClose} className="bg-primary text-on-primary px-6 py-2.5 rounded-xl font-bold text-label">{t(locale, "common_close")}</button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Regarding */}
              <div className="flex items-center gap-2 bg-surface-container rounded-xl px-3 py-2.5 text-label text-on-surface-variant">
                <Icon name="business" className="text-body text-outline" />
                {t(locale, "feedback_regarding")} <span className="font-bold text-on-surface ms-1">{companyName}</span>
              </div>

              <p className="text-label text-outline leading-relaxed">{t(locale, "waitlist_modal_sub")}</p>

              {/* Name + Phone */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-caption font-bold text-on-surface mb-1">{t(locale, "waitlist_your_name")} <span className="text-error">*</span></label>
                  <input className="field-input !py-2 text-label" value={name} onChange={(e) => { setName(e.target.value); if (error) setError(""); }} />
                </div>
                <div>
                  <label className="block text-caption font-bold text-on-surface mb-1">{t(locale, "waitlist_phone")} <span className="text-error">*</span></label>
                  <PhoneInput value={phone} onChange={(v) => { setPhone(v); if (error) setError(""); }} hideError />
                </div>
              </div>

              {/* Service */}
              <div>
                <label className="block text-caption font-bold text-on-surface mb-1">{t(locale, "waitlist_service")}</label>
                {services.length > 0 ? (
                  <Select
                    triggerClassName="field-input !py-2 text-label flex items-center justify-between gap-2 text-start touch-press"
                    value={service}
                    onChange={setService}
                    placeholder="—"
                    options={[{ value: "", label: "—" }, ...services.map((s) => ({ value: s, label: s }))]}
                  />
                ) : (
                  <input className="field-input !py-2 text-label" value={service} onChange={(e) => setService(e.target.value)} />
                )}
              </div>

              {/* Note */}
              <div>
                <label className="block text-caption font-bold text-on-surface mb-1">{t(locale, "waitlist_note")}</label>
                <textarea className="field-input resize-none" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
              </div>

              {error && <p className="text-caption text-error font-bold">{error}</p>}

              {/* CAPTCHA — renders only when VITE_TURNSTILE_SITE_KEY is set */}
              <Captcha onToken={setCaptchaToken} resetSignal={captchaReset} />

              <button
                type="submit"
                disabled={isSubmitting}
                className={`w-full bg-amber-500 text-white py-3 rounded-xl font-bold text-label transition-colors touch-press
                  ${isSubmitting ? "opacity-80 cursor-not-allowed" : "hover:bg-amber-600 btn-press"}`}
              >
                {t(locale, "waitlist_send")}
              </button>

              {/* Honeypot — hidden from real users; bots auto-fill it. */}
              <input
                type="text"
                name="hp_field"
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                data-1p-ignore="true"
                data-lpignore="true"
                data-bwignore="true"
                data-form-type="other"
                value={honeypot}
                onChange={(e) => setHoneypot(e.target.value)}
                className="sr-only"
              />
            </form>
          )}
        </div>
    </Modal>
  );
}


/**
 * A one-line availability chip beside the company name.
 *
 * Reads the fields the server already derived (busy / nextAvailableAt /
 * upcomingBusyFrom) rather than recomputing from windows on the client — a
 * second implementation could disagree with the CTA on the same page.
 */
function AvailabilityBadge({ company, locale }: {
  company: { busy?: boolean | null; busyUntil?: number | null; nextAvailableAt?: number | null;
             upcomingBusyFrom?: number | null; busyReason?: string | null; responseTime?: string };
  locale: Locale;
}) {
  const { state, text } = availabilityLabel(company, locale);
  const style =
    state === "busy" ? "bg-amber-100 text-amber-800"
    : state === "upcoming" ? "bg-surface-container text-on-surface-variant"
    : "bg-green-100 text-green-800";
  const icon = state === "busy" ? "event_busy" : state === "upcoming" ? "event_upcoming" : "check_circle";

  return (
    <span
      className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-caption ${style}`}
      title={company.busyReason ?? undefined}
    >
      <span className="material-symbols-outlined text-label" style={{ fontVariationSettings: "FILL 1" }} aria-hidden="true" translate="no">{icon}</span>
      {text}
    </span>
  );
}
