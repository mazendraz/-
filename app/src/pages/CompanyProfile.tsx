import { Link, useNavigate, useParams } from "react-router-dom";
import { useState, useEffect, useRef } from "react";
import { useReveal } from "../hooks/useReveal";
import Stars from "../components/Stars";
import { useCompany, useCatalogStatus } from "../lib/catalog";
import LazyImage from "../components/LazyImage";
import CatalogError from "../components/CatalogError";
import SaveButton from "../components/SaveButton";
import { usePageMeta } from "../hooks/usePageMeta";
import { addFeedback, type FeedbackType } from "../lib/feedback";
import { useDialogA11y } from "../hooks/useDialogA11y";
import { useLocale } from "../context/LocaleContext";
import { t, type StringKey, type Locale } from "../lib/i18n";

const TABS: { key: "Overview" | "Projects" | "Gallery"; labelKey: StringKey }[] = [
  { key: "Overview", labelKey: "profile_tab_overview" },
  { key: "Projects", labelKey: "profile_tab_projects" },
  { key: "Gallery", labelKey: "profile_tab_gallery" },
];
type Tab = (typeof TABS)[number]["key"];

export default function CompanyProfile() {
  const { slug } = useParams<{ slug: string }>();
  const { locale } = useLocale();
  const navigate = useNavigate();
  const company = useCompany(slug ?? "");
  const status = useCatalogStatus();
  usePageMeta(
    company ? `${company.name} | Al Assema` : "Company | Al Assema",
    company?.tagline
  );
  const [tab, setTab] = useState<Tab>("Overview");
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const lightboxCloseRef = useRef<HTMLButtonElement>(null);
  const swipeX = useRef<number | null>(null);

  const headerRef = useReveal(0.06);
  const bodyRef = useReveal(0.06);

  // Keyboard nav for lightbox
  const lightboxOpen = lightboxIdx !== null;
  const galleryLength = company?.gallery.length ?? 0;
  useEffect(() => {
    if (lightboxOpen) lightboxCloseRef.current?.focus();
  }, [lightboxOpen]);
  useEffect(() => {
    if (!lightboxOpen) return;
    const total = galleryLength;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); setLightboxIdx(null); }
      if (e.key === "ArrowLeft") setLightboxIdx((i) => (i !== null && i > 0 ? i - 1 : i));
      if (e.key === "ArrowRight") setLightboxIdx((i) => (i !== null && i < total - 1 ? i + 1 : i));
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [lightboxOpen, galleryLength]);
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
    });
    document.head.appendChild(script);
    return () => { document.getElementById("ld-company")?.remove(); };
  }, [company?.slug]);

  if (!company) {
    // API mode: distinguish "still loading" and "backend unreachable" from a
    // genuine 404 so we don't flash "not found" while the catalog hydrates.
    if (status === "loading") {
      return (
        <div className="min-h-screen flex items-center justify-center pt-20">
          <div className="w-8 h-8 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
        </div>
      );
    }
    if (status === "error") {
      return (
        <div className="min-h-screen flex items-center justify-center pt-20 px-5">
          <CatalogError message="We couldn't load this company. Please try again." />
        </div>
      );
    }
    return (
      <div className="min-h-screen flex items-center justify-center flex-col gap-4 pt-20">
        <span className="material-symbols-outlined text-outline text-[64px]">business_center</span>
        <p className="font-headline-md text-headline-md text-on-surface">{t(locale, "profile_not_found")}</p>
        <Link to="/companies" className="text-primary font-label-md text-label-md hover:underline inline-flex items-center gap-1">
          <span className="material-symbols-outlined text-[16px] rtl-flip">arrow_back</span> {t(locale, "profile_back_to_companies")}
        </Link>
      </div>
    );
  }

  return (
    <div className="bg-surface min-h-screen pb-36 md:pb-0">
      {/* Mobile sticky CTA bar — sits directly above the bottom tab bar */}
      <div
        className="md:hidden fixed left-0 right-0 z-30 px-4 pt-2.5 pb-2.5 bg-white/96 backdrop-blur-xl border-t border-outline-variant/25 shadow-[0_-8px_24px_-6px_rgba(0,0,0,0.08)] flex items-center gap-2.5"
        style={{ bottom: "calc(3.5rem + env(safe-area-inset-bottom, 0px))" }}
      >
        <SaveButton slug={company.slug} className="!w-12 !h-12 flex-shrink-0 border border-outline-variant/30" />
        <Link
          to={`/request?company=${company.slug}&companyName=${encodeURIComponent(company.name)}`}
          className="flex-1 flex items-center justify-center gap-2 bg-primary text-on-primary
                     py-3.5 rounded-xl font-bold text-[15px] shadow-bloom touch-press btn-press"
        >
          <span className="material-symbols-outlined text-[20px]">send</span>
          {t(locale, "common_request_service")}
        </Link>
      </div>

      {/* Hero cover */}
      <div className="relative w-full h-64 md:h-96 overflow-hidden">
        <LazyImage src={company.cover} alt={company.name} eager wrapperClassName="absolute inset-0" className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
        {/* Back breadcrumb */}
        <div className="absolute top-20 left-margin-mobile md:left-margin-desktop rtl:left-auto rtl:right-margin-mobile rtl:md:right-margin-desktop">
          <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-white/80 hover:text-white transition-colors bg-white/10 backdrop-blur-sm px-3 py-1.5 rounded-full text-label-sm font-label-sm">
            <span className="material-symbols-outlined text-[16px] rtl-flip">arrow_back</span> {t(locale, "profile_back")}
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
                <LazyImage src={company.logo} alt={`${company.name} logo`} className="w-full h-full object-cover" />
              </div>

              <div className="flex-grow">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <h1 className="text-headline-lg-mobile md:text-headline-lg font-headline-lg text-on-surface">{company.name}</h1>
                  {company.verified && (
                    <span className="flex items-center gap-1 bg-primary/10 text-primary px-2 py-0.5 rounded-full text-label-sm font-label-sm">
                      <span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>verified</span> {t(locale, "common_verified")}
                    </span>
                  )}
                </div>
                <p className="text-label-md font-label-md text-outline mb-2">{company.categoryLabel}</p>
                <div className="flex items-center gap-3 flex-wrap">
                  <Stars n={Math.round(company.rating)} size="text-[16px]" />
                  <span className="font-label-md text-label-md text-on-surface">{company.rating}</span>
                  <span className="text-outline text-label-sm">({company.reviewCount} {t(locale, "common_reviews")})</span>
                  <span className="text-outline">·</span>
                  <span className="text-outline text-label-sm">{company.completedProjects} {t(locale, "profile_completed_projects")}</span>
                </div>
                {/* Trust pills */}
                <div className="flex items-center gap-2 flex-wrap mt-3">
                  <span className="flex items-center gap-1.5 bg-green-50 text-green-700 px-2.5 py-1 rounded-full text-[12px] font-bold">
                    <span className="material-symbols-outlined text-[14px]">bolt</span>
                    {t(locale, "profile_responds")} {company.responseTime}
                  </span>
                  <span className="flex items-center gap-1.5 bg-surface-container text-on-surface-variant px-2.5 py-1 rounded-full text-[12px] font-bold">
                    <span className="material-symbols-outlined text-[14px]">workspace_premium</span>
                    {company.yearsExperience} {t(locale, "profile_years_experience")}
                  </span>
                  <span className="flex items-center gap-1.5 bg-surface-container text-on-surface-variant px-2.5 py-1 rounded-full text-[12px] font-bold">
                    <span className="material-symbols-outlined text-[14px]">verified_user</span>
                    {t(locale, "profile_verified_since")} {company.verifiedSince}
                  </span>
                </div>
              </div>

              {/* Request CTA — desktop only; mobile uses sticky bar */}
              <div className="hidden sm:flex sm:flex-shrink-0 mt-2 sm:mt-0 gap-2">
                <SaveButton slug={company.slug} variant="pill" />
                <Link
                  to={`/request?company=${company.slug}&companyName=${encodeURIComponent(company.name)}`}
                  className="flex items-center justify-center gap-2 bg-primary text-on-primary px-6 py-3 rounded-xl
                             font-bold text-[14px] hover:bg-primary-container transition-colors shadow-bloom touch-press btn-press"
                >
                  <span className="material-symbols-outlined text-[20px]">send</span>
                  {t(locale, "common_request_service")}
                </Link>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 overflow-x-auto scrollbar-hide -mx-2 px-2">
            {TABS.map((tb) => (
              <button
                key={tb.key}
                onClick={() => setTab(tb.key)}
                className={`px-4 py-2.5 text-label-md font-label-md whitespace-nowrap rounded-t-lg border-b-2 transition-colors ${
                  tab === tb.key
                    ? "text-primary border-primary"
                    : "text-outline border-transparent hover:text-on-surface hover:border-outline-variant"
                }`}
              >
                {t(locale, tb.labelKey)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tab content */}
      <div className="max-w-container-max mx-auto px-margin-mobile md:px-margin-desktop py-stack-xl">
        <div ref={bodyRef} className="fade-up">

          {/* ── Overview ── */}
          {tab === "Overview" && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-gutter">
              <div className="lg:col-span-2 space-y-8">
                {/* About */}
                <section>
                  <h2 className="font-headline-md text-headline-md text-on-surface mb-4">{t(locale, "profile_about")} {company.name}</h2>
                  <p className="text-body-lg font-body-lg text-on-surface-variant leading-relaxed">{company.about}</p>
                </section>

                {/* Services */}
                <section>
                  <h2 className="font-headline-md text-headline-md text-on-surface mb-4">{t(locale, "profile_services_offered")}</h2>
                  <div className="flex flex-wrap gap-3">
                    {company.services.map((s) => (
                      <div key={s} className="flex items-center gap-2 bg-surface-container-lowest border border-outline-variant/20 rounded-xl px-4 py-2.5 shadow-sm">
                        <span className="material-symbols-outlined text-primary text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                        <span className="text-label-md font-label-md text-on-surface">{s}</span>
                      </div>
                    ))}
                  </div>
                </section>

                {/* Recent projects preview */}
                <section>
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="font-headline-md text-headline-md text-on-surface">{t(locale, "profile_recent_projects")}</h2>
                    <button onClick={() => setTab("Projects")} className="text-primary text-label-md font-label-md hover:underline flex items-center gap-1">
                      {t(locale, "common_view_all")} <span className="material-symbols-outlined text-[16px] rtl-flip">arrow_forward</span>
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {company.projects.slice(0, 2).map((p) => (
                      <div key={p.title} className="bg-surface-container-lowest rounded-xl overflow-hidden shadow-bloom">
                        <div className="h-44 overflow-hidden">
                          <LazyImage src={p.img} alt={p.title} wrapperClassName="h-full" className="w-full h-full object-cover hover:scale-105 transition-transform duration-700" />
                        </div>
                        <div className="p-4">
                          <p className="font-label-md text-label-md text-on-surface mb-1">{p.title}</p>
                          <p className="text-label-sm font-label-sm text-outline">{p.year}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              </div>

              {/* Sidebar */}
              <aside className="space-y-5">
                {/* Credentials */}
                <div className="bg-surface-container-lowest rounded-2xl p-5 shadow-bloom">
                  <h3 className="font-bold text-[12px] text-outline mb-3 uppercase tracking-wider">{t(locale, "profile_credentials")}</h3>
                  <div className="flex flex-wrap gap-2">
                    {company.badges.map((b) => (
                      <span key={b} className="flex items-center gap-1 bg-primary/8 text-primary px-2.5 py-1.5 rounded-lg text-[12px] font-bold">
                        <span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>verified</span>
                        {b}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Stats */}
                <div className="bg-surface-container-lowest rounded-2xl p-5 shadow-bloom">
                  <h3 className="font-bold text-[12px] text-outline mb-4 uppercase tracking-wider">{t(locale, "profile_quick_stats")}</h3>
                  {[
                    { icon: "star", label: t(locale, "profile_stat_rating"), val: `${company.rating} / 5.0` },
                    { icon: "reviews", label: t(locale, "profile_stat_reviews"), val: `${company.reviewCount}` },
                    { icon: "construction", label: t(locale, "profile_stat_completed"), val: `${company.completedProjects}` },
                    { icon: "workspace_premium", label: t(locale, "profile_stat_experience"), val: `${company.yearsExperience} ${t(locale, "profile_years")}` },
                    { icon: "bolt", label: t(locale, "profile_stat_response"), val: company.responseTime },
                    { icon: "location_on", label: t(locale, "profile_stat_location"), val: company.location },
                  ].map((s) => (
                    <div key={s.label} className="flex items-center gap-3 py-2.5 border-b border-outline-variant/20 last:border-0">
                      <span className="material-symbols-outlined text-primary text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>{s.icon}</span>
                      <div>
                        <p className="text-[12px] text-outline">{s.label}</p>
                        <p className="text-[14px] font-bold text-on-surface">{s.val}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* CTA card */}
                <div className="bg-primary rounded-2xl p-5 shadow-bloom text-on-primary">
                  <span className="material-symbols-outlined text-[32px] mb-2 block" style={{ fontVariationSettings: "'FILL' 1" }}>handshake</span>
                  <h3 className="font-headline-md text-headline-md mb-2">{t(locale, "profile_ready_title")}</h3>
                  <p className="text-body-md font-body-md opacity-90 mb-4">{t(locale, "profile_ready_sub")}</p>
                  <Link
                    to={`/request?company=${company.slug}&companyName=${encodeURIComponent(company.name)}`}
                    className="block w-full text-center bg-white text-primary font-label-md text-label-md py-3 rounded-xl hover:bg-surface-container-low transition-colors font-bold"
                  >
                    {t(locale, "profile_request_company")}
                  </Link>
                </div>

                {/* Contact */}
                <div className="bg-surface-container-lowest rounded-2xl p-5 shadow-bloom">
                  <h3 className="font-label-md text-label-md text-outline mb-3 uppercase tracking-wider">{t(locale, "profile_contact")}</h3>
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-primary text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>phone</span>
                    <span className="text-body-md font-body-md text-on-surface">{company.phone}</span>
                  </div>
                </div>

                {/* Report a problem */}
                <button
                  onClick={() => setFeedbackOpen(true)}
                  className="w-full flex items-center gap-2.5 px-4 py-3 rounded-xl border border-outline-variant/30 text-outline hover:text-on-surface hover:border-outline-variant/60 hover:bg-surface-container transition-colors text-[13px] font-bold"
                >
                  <span className="material-symbols-outlined text-[18px]">report_problem</span>
                  {t(locale, "profile_report")}
                </button>
              </aside>
            </div>
          )}

          {/* ── Projects ── */}
          {tab === "Projects" && (
            <div>
              <h2 className="font-headline-md text-headline-md text-on-surface mb-6">
                {t(locale, "profile_projects_count")} ({company.projects.length})
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-gutter">
                {company.projects.map((p) => (
                  <div key={p.title} className="bg-surface-container-lowest rounded-2xl overflow-hidden shadow-bloom shadow-bloom-hover transition-all-spring">
                    <div className="relative h-56 overflow-hidden">
                      <img src={p.img} alt={p.title} className="w-full h-full object-cover hover:scale-105 transition-transform duration-700" />
                      <div className="absolute top-3 right-3 rtl:right-auto rtl:left-3 bg-black/60 text-white text-label-sm font-label-sm px-2 py-1 rounded-full">{p.year}</div>
                    </div>
                    <div className="p-5">
                      <h3 className="font-headline-md text-headline-md text-on-surface mb-2">{p.title}</h3>
                      <p className="text-body-md font-body-md text-on-surface-variant leading-relaxed text-sm">{p.description}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-10 bg-surface-container-lowest rounded-2xl p-8 text-center shadow-bloom">
                <p className="text-body-lg font-body-lg text-outline mb-4">{t(locale, "profile_like_what")} {company.name}.</p>
                <Link
                  to={`/request?company=${company.slug}&companyName=${encodeURIComponent(company.name)}`}
                  className="inline-flex items-center gap-2 bg-primary text-on-primary px-6 py-3 rounded-xl font-label-md text-label-md hover:bg-primary-container transition-colors shadow-bloom"
                >
                  <span className="material-symbols-outlined text-[20px]">send</span>
                  {t(locale, "common_request_service")}
                </Link>
              </div>
            </div>
          )}

          {/* ── Gallery ── */}
          {tab === "Gallery" && (
            <div>
              <h2 className="font-headline-md text-headline-md text-on-surface mb-6">{t(locale, "profile_photo_gallery")}</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {company.gallery.map((img, i) => (
                  <div
                    key={i}
                    className="relative overflow-hidden rounded-xl aspect-square cursor-pointer shadow-bloom shadow-bloom-hover transition-all-spring"
                    onClick={() => setLightboxIdx(i)}
                  >
                    <img src={img} alt={`${company.name} gallery ${i + 1}`} className="w-full h-full object-cover hover:scale-105 transition-transform duration-700" />
                    <div className="absolute inset-0 bg-black/0 hover:bg-black/20 transition-colors flex items-center justify-center">
                      <span className="material-symbols-outlined text-white opacity-0 group-hover:opacity-100 text-[32px]">zoom_in</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
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

      {/* Lightbox */}
      {lightboxIdx !== null && (
        <div
          role="dialog"
          aria-modal
          aria-label={`${company.name} gallery, photo ${lightboxIdx + 1} of ${company.gallery.length}`}
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightboxIdx(null)}
          onTouchStart={(e) => { swipeX.current = e.touches[0].clientX; }}
          onTouchEnd={(e) => {
            if (swipeX.current === null) return;
            const delta = e.changedTouches[0].clientX - swipeX.current;
            swipeX.current = null;
            if (Math.abs(delta) < 50) return;
            if (delta > 0 && lightboxIdx > 0) setLightboxIdx(lightboxIdx - 1);
            if (delta < 0 && lightboxIdx < company.gallery.length - 1) setLightboxIdx(lightboxIdx + 1);
          }}
        >
          {/* Close */}
          <button
            ref={lightboxCloseRef}
            onClick={() => setLightboxIdx(null)}
            aria-label={t(locale, "profile_close_gallery")}
            className="absolute top-4 right-4 z-10 text-white bg-white/10 rounded-full p-2 hover:bg-white/20 transition-colors"
          >
            <span className="material-symbols-outlined">close</span>
          </button>

          {/* Prev */}
          {lightboxIdx > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); setLightboxIdx(lightboxIdx - 1); }}
              aria-label={t(locale, "profile_prev_photo")}
              className="absolute left-4 top-1/2 -translate-y-1/2 z-10 text-white bg-white/10 rounded-full p-2 hover:bg-white/20 transition-colors"
            >
              <span className="material-symbols-outlined rtl-flip">arrow_back</span>
            </button>
          )}

          <img
            src={company.gallery[lightboxIdx]}
            alt={`${company.name} — photo ${lightboxIdx + 1}`}
            className="max-w-full max-h-[90vh] rounded-xl object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            draggable={false}
          />

          {/* Next */}
          {lightboxIdx < company.gallery.length - 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); setLightboxIdx(lightboxIdx + 1); }}
              aria-label={t(locale, "profile_next_photo")}
              className="absolute right-4 top-1/2 -translate-y-1/2 z-10 text-white bg-white/10 rounded-full p-2 hover:bg-white/20 transition-colors"
            >
              <span className="material-symbols-outlined rtl-flip">arrow_forward</span>
            </button>
          )}

          {/* Counter */}
          {company.gallery.length > 1 && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/70 text-[13px] font-bold bg-black/40 px-3 py-1 rounded-full pointer-events-none">
              {lightboxIdx + 1} / {company.gallery.length}
            </div>
          )}
        </div>
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
  const { containerRef, trapTab } = useDialogA11y(true, onClose);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim()) { setError(t(locale, "feedback_err")); return; }
    addFeedback({ type, name: name.trim(), phone: phone.trim(), companySlug, companyName, message: message.trim() });
    setSubmitted(true);
  }

  const typeLabels: Record<FeedbackType, string> = {
    problem: t(locale, "feedback_problem"),
    suggestion: t(locale, "feedback_suggestion"),
    inquiry: t(locale, "feedback_inquiry"),
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-on-background/45 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        ref={containerRef}
        onKeyDown={trapTab}
        role="dialog"
        aria-modal
        aria-label={t(locale, "feedback_title")}
        className="bg-surface-container-lowest w-full max-w-md rounded-2xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant/20">
          <h2 className="font-bold text-[17px] text-on-surface">{t(locale, "feedback_title")}</h2>
          <button onClick={onClose} aria-label={t(locale, "common_close")} className="p-1.5 rounded-lg hover:bg-surface-container transition-colors">
            <span className="material-symbols-outlined text-outline">close</span>
          </button>
        </div>

        <div className="p-5">
          {submitted ? (
            <div className="text-center py-6">
              <span className="material-symbols-outlined text-primary text-[48px] mb-3 block"
                style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
              <p className="font-bold text-[17px] text-on-surface mb-1">{t(locale, "feedback_received")}</p>
              <p className="text-[14px] text-outline mb-5">{t(locale, "feedback_received_sub")}</p>
              <button onClick={onClose} className="bg-primary text-on-primary px-6 py-2.5 rounded-xl font-bold text-[14px]">{t(locale, "common_close")}</button>
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
                      className={`flex flex-col items-center gap-1 py-3 rounded-xl border text-[12px] font-bold transition-colors
                        ${type === ft ? "border-primary bg-primary/8 text-primary" : "border-outline-variant/30 text-outline hover:border-outline-variant/60"}`}
                    >
                      <span className="material-symbols-outlined text-[20px]">{icons[ft]}</span>
                      {typeLabels[ft]}
                    </button>
                  );
                })}
              </div>

              {/* Regarding */}
              <div className="flex items-center gap-2 bg-surface-container rounded-xl px-3 py-2.5 text-[13px] text-on-surface-variant">
                <span className="material-symbols-outlined text-[16px] text-outline">business</span>
                {t(locale, "feedback_regarding")} <span className="font-bold text-on-surface ms-1">{companyName}</span>
              </div>

              {/* Name + Phone */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[12px] font-bold text-on-surface mb-1">{t(locale, "feedback_your_name")}</label>
                  <input className="field-input !py-2 text-[13px]" placeholder={t(locale, "feedback_optional")} value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div>
                  <label className="block text-[12px] font-bold text-on-surface mb-1">{t(locale, "feedback_phone")}</label>
                  <input className="field-input !py-2 text-[13px]" placeholder={t(locale, "feedback_optional")} value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" />
                </div>
              </div>

              {/* Message */}
              <div>
                <label className="block text-[12px] font-bold text-on-surface mb-1">{t(locale, "feedback_message")} <span className="text-error">*</span></label>
                <textarea
                  className={`field-input resize-none ${error ? "error" : ""}`}
                  rows={4}
                  placeholder={t(locale, "feedback_message_ph")}
                  value={message}
                  onChange={(e) => { setMessage(e.target.value); if (error) setError(""); }}
                />
                {error && <p className="text-[12px] text-error font-bold mt-1">{error}</p>}
              </div>

              <button
                type="submit"
                className="w-full bg-primary text-on-primary py-3 rounded-xl font-bold text-[14px] hover:bg-primary-container transition-colors touch-press btn-press"
              >
                {t(locale, "feedback_send")}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
