import { Link } from "react-router-dom";
import { useState } from "react";
import { createPortal } from "react-dom";
import { FEATURED_PROJECTS } from "../lib/data";
import { useCompanies, useCategoriesWithCounts, useCatalogStatus } from "../lib/catalog";
import { CompanyCardSkeleton } from "../components/Skeleton";
import { useSiteReviews, useReviewsEnabled, addSiteReview } from "../lib/siteReviews";
import { useCountUp } from "../hooks/useCountUp";
import { useReveal } from "../hooks/useReveal";
import Stars from "../components/Stars";
import LazyImage from "../components/LazyImage";
import { usePageMeta } from "../hooks/usePageMeta";
import { useDialogA11y } from "../hooks/useDialogA11y";
import { useLocale } from "../context/LocaleContext";
import { t } from "../lib/i18n";

// ── Generic reveal wrapper ────────────────────────────────────────────────
function Reveal({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) {
  const ref = useReveal();
  return (
    <div ref={ref} className={`fade-up ${className}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

// ── Hero image ─────────────────────────────────────────────────────────────
const HERO = "/img/seed-16.jpg";

// ═══════════════════════════════════════════════════════════════════════════
export default function Home() {
  const heroTitle = useReveal<HTMLHeadingElement>();
  const heroSub = useReveal<HTMLParagraphElement>();
  const heroCta = useReveal<HTMLDivElement>();
  usePageMeta();
  const { locale } = useLocale();
  const COMPANIES = useCompanies();
  const SERVICE_CATEGORIES = useCategoriesWithCounts();
  const status = useCatalogStatus();
  const loadingEmpty = status === "loading" && COMPANIES.length === 0;
  const siteReviews = useSiteReviews();
  const reviewsEnabled = useReviewsEnabled();
  const [reviewModalOpen, setReviewModalOpen] = useState(false);

  // Average customer rating — derived from live company ratings (×10 so the
  // counter can animate an integer), not a hardcoded number.
  const avgRating10 = COMPANIES.length
    ? Math.round((COMPANIES.reduce((s, c) => s + c.rating, 0) / COMPANIES.length) * 10)
    : 0;

  function scrollTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  }

  return (
    <div className="bg-surface text-on-surface overflow-x-hidden">

      {/* ═══════════════════════════════════════════════════
          HERO — full-screen NAC skyline
      ═══════════════════════════════════════════════════ */}
      <header className="relative w-full h-screen min-h-[640px] max-h-[900px] flex items-center justify-center overflow-hidden">
        {/* Background — eager loaded, above the fold */}
        <img
          src={HERO}
          alt="New Administrative Capital skyline"
          loading="eager"
          decoding="async"
          className="absolute inset-0 w-full h-full object-cover object-center"
        />
        <div className="absolute inset-0 hero-scrim" />

        {/* Content */}
        <div className="relative z-10 text-center px-5 md:px-8 max-w-5xl mx-auto w-full mt-16 md:mt-20">
          <h1
            ref={heroTitle}
            className="fade-up text-white font-black mb-5 drop-shadow-lg tracking-tight
                       text-[2.2rem] leading-[1.15]
                       md:text-display-xl md:leading-[1.1]"
          >
            {t(locale, "home_hero_title_1")}<br className="hidden md:block" />{" "}
            {t(locale, "home_hero_title_2")}
          </h1>
          <p
            ref={heroSub}
            className="fade-up text-white/90 mb-8 max-w-xl mx-auto drop-shadow
                       text-[16px] md:text-body-lg leading-relaxed"
            style={{ transitionDelay: "100ms" }}
          >
            {t(locale, "home_hero_sub")}
          </p>

          {/* CTA buttons */}
          <div
            ref={heroCta}
            className="fade-up flex flex-col items-center sm:flex-row sm:justify-center gap-4"
            style={{ transitionDelay: "200ms" }}
          >
            {/* Primary CTA */}
            <button
              onClick={() => scrollTo("services")}
              className="w-[85%] sm:w-auto bg-primary text-on-primary px-8 py-[18px] sm:py-4 rounded-full
                         font-bold text-[15px] hover:bg-primary-container transition-all duration-300
                         shadow-lg touch-press btn-press"
            >
              {t(locale, "home_cta_explore")}
            </button>

            {/* Glass CTA */}
            <button
              onClick={() => scrollTo("companies")}
              className="group w-[85%] sm:w-auto flex items-center justify-center gap-2.5
                         px-8 py-[18px] sm:py-4 rounded-full
                         bg-white/[0.15] backdrop-blur-[20px]
                         border border-white/30
                         shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_8px_32px_rgba(0,0,0,0.22)]
                         text-white font-semibold text-[15px] tracking-[0.03em]
                         hover:bg-white/[0.25]
                         hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_16px_48px_rgba(0,0,0,0.35)]
                         hover:scale-[1.02]
                         active:scale-[0.98]
                         transition-all duration-300 ease-out
                         touch-press"
            >
              {t(locale, "home_cta_browse")}
              <span
                className="material-symbols-outlined text-[18px] opacity-80 rtl-flip
                           group-hover:translate-x-1 transition-transform duration-300"
              >
                arrow_forward
              </span>
            </button>
          </div>
        </div>

        {/* Scroll cue */}
        <button
          onClick={() => scrollTo("stats")}
          className="absolute bottom-8 left-1/2 -translate-x-1/2 text-white flex flex-col items-center gap-1 animate-float opacity-75 hover:opacity-100 transition-opacity"
        >
          <span className="text-[10px] font-bold tracking-[0.15em] uppercase">{t(locale, "home_scroll")}</span>
          <span className="material-symbols-outlined text-[28px]">expand_more</span>
        </button>
      </header>

      {/* ═══════════════════════════════════════════════════
          STATS — animated counters
      ═══════════════════════════════════════════════════ */}
      <section
        id="stats"
        className="bg-surface-container-lowest border-b border-surface-dim/20
                   relative rounded-t-[28px] md:rounded-t-[40px] -mt-6 z-10 py-10 md:py-14"
      >
        <div className="max-w-container-max mx-auto px-margin-mobile md:px-margin-desktop">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-10 text-center">
            <StatCounter target={COMPANIES.length} label={t(locale, "home_stat_partners")} />
            <StatCounter target={COMPANIES.reduce((s, c) => s + c.completedProjects, 0)} label={t(locale, "home_stat_projects")} />
            <StatCounter target={avgRating10} label={t(locale, "home_stat_rating")} displayFn={(n) => `${(n / 10).toFixed(1)}★`} />
            <StatCounter target={SERVICE_CATEGORIES.length} label={t(locale, "home_stat_categories")} />
          </div>
        </div>
      </section>

      <div className="max-w-container-max mx-auto px-margin-mobile md:px-margin-desktop">

        {/* ═══════════════════════════════════════════════════
            SERVICES
        ═══════════════════════════════════════════════════ */}
        <section id="services" className="pt-10 md:pt-14 pb-14 md:pb-20">
          <SectionHeader
            title={t(locale, "home_services_title")}
            sub={t(locale, "home_services_sub")}
            linkTo="/services"
            linkLabel={t(locale, "home_services_link")}
          />
          {/* Mobile: horizontal scroll | Desktop: grid */}
          <div className="mobile-scroll mobile-bleed md:grid md:grid-cols-3 md:gap-gutter">
            {SERVICE_CATEGORIES.map((cat) => (
              <Link
                key={cat.slug}
                to={`/services/${cat.slug}`}
                className="group relative rounded-2xl overflow-hidden shadow-bloom card-lift touch-press
                           w-[240px] h-52 flex-shrink-0 md:w-auto"
              >
                <LazyImage
                  src={cat.cover}
                  alt={cat.label}
                  wrapperClassName="absolute inset-0"
                  className="w-full h-full object-cover group-hover:scale-[1.05] transition-transform duration-300 ease-out"
                />
                {/* Premium scrim — bottom always darker than top */}
                <div className="absolute inset-0 card-scrim" />
                <div className="absolute inset-0 card-scrim-hover" />
                <div className="absolute inset-x-0 bottom-0 p-5 pb-6 md:pb-5">
                  {/* Glass icon circle */}
                  <div className="bg-white/15 backdrop-blur-md border border-white/25 rounded-full p-2 inline-flex mb-3 shadow-lg">
                    <span className="material-symbols-outlined text-white text-[18px]"
                      style={{ fontVariationSettings: "'FILL' 1" }}>{cat.icon}</span>
                  </div>
                  <h3 className="text-white font-extrabold text-[19px] md:text-[18px] leading-snug mb-1.5 text-shadow-soft">{cat.label}</h3>
                  <p className="text-white/80 text-[13px] md:text-[12px] font-medium text-shadow-soft">{cat.count} {t(locale, "home_companies_label")}</p>
                </div>
              </Link>
            ))}
          </div>
          <div className="mt-5 md:hidden text-center">
            <Link to="/services" className="text-primary font-bold text-[14px] inline-flex items-center gap-1 hover:underline">
              {t(locale, "common_all_categories")} <span className="material-symbols-outlined text-[16px] rtl-flip">arrow_forward</span>
            </Link>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════
            COMPANIES
        ═══════════════════════════════════════════════════ */}
        <section id="companies" className="py-14 md:py-20 border-t border-surface-dim/20 bg-gradient-to-br from-primary/[0.06] via-background to-secondary/[0.04]">
          <SectionHeader
            title={t(locale, "home_companies_title")}
            sub={t(locale, "home_companies_sub")}
            linkTo="/companies"
            linkLabel={t(locale, "home_companies_link")}
          />
          {/* Mobile: horizontal scroll | Desktop: grid */}
          <div className="mobile-scroll mobile-bleed md:grid md:grid-cols-3 md:gap-gutter">
            {loadingEmpty ? Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="w-[275px] flex-shrink-0 md:w-auto"><CompanyCardSkeleton /></div>
            )) : COMPANIES.filter((c) => c.featured !== false).map((c) => (
              <Link
                key={c.id}
                to={`/companies/${c.slug}`}
                className="group bg-white/50 backdrop-blur-2xl border border-white/50 rounded-2xl overflow-hidden
                           shadow-[0_8px_32px_rgba(0,85,120,0.10)] card-lift
                           touch-press flex flex-col w-[275px] flex-shrink-0 md:w-auto"
              >
                {/* Cover */}
                <div className="relative h-40 overflow-hidden flex-shrink-0">
                  <LazyImage
                    src={c.cover}
                    alt={c.name}
                    wrapperClassName="absolute inset-0"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                  {/* Logo */}
                  <div className="absolute bottom-0 left-4 translate-y-1/2 w-12 h-12 rounded-xl overflow-hidden
                                  border-2 border-white shadow-md bg-white">
                    <img src={c.logo} alt="" className="w-full h-full object-cover" loading="lazy" />
                  </div>
                  {/* Verified */}
                  {c.verified && (
                    <div className="absolute top-2.5 right-2.5 flex items-center gap-1 bg-white/90 backdrop-blur-sm px-2 py-1 rounded-full shadow-sm">
                      <span className="material-symbols-outlined text-primary text-[12px]"
                        style={{ fontVariationSettings: "'FILL' 1" }}>verified</span>
                      <span className="text-[11px] font-bold text-primary">{t(locale, "common_verified")}</span>
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="pt-8 px-4 pb-4 flex flex-col flex-grow">
                  <h3 className="font-bold text-[17px] text-on-surface group-hover:text-primary transition-colors mb-0.5 leading-snug">{c.name}</h3>
                  <p className="text-[12px] font-bold text-outline mb-2">{c.categoryLabel}</p>
                  <div className="flex items-center gap-1.5 mb-2">
                    <Stars n={Math.round(c.rating)} />
                    <span className="font-bold text-[13px] text-on-surface">{c.rating}</span>
                    <span className="text-outline text-[12px]">({c.reviewCount})</span>
                  </div>
                  <p className="text-[13px] text-on-surface-variant leading-relaxed line-clamp-2 flex-grow">{c.tagline}</p>
                  <div className="mt-3 pt-3 border-t border-outline-variant/15 flex items-center justify-between">
                    <span className="text-[12px] text-outline">{c.completedProjects} {t(locale, "common_projects")}</span>
                    <span className="text-primary text-[13px] font-bold flex items-center gap-0.5 group-hover:translate-x-1 transition-transform">
                      {t(locale, "home_view")} <span className="material-symbols-outlined text-[14px] rtl-flip">arrow_forward</span>
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
          <div className="mt-5 md:hidden text-center">
            <Link to="/companies" className="text-primary font-bold text-[14px] inline-flex items-center gap-1 hover:underline">
              {t(locale, "common_all_companies")} <span className="material-symbols-outlined text-[16px] rtl-flip">arrow_forward</span>
            </Link>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════
            PROJECTS
        ═══════════════════════════════════════════════════ */}
        <section id="projects" className="py-14 md:py-20 border-t border-surface-dim/20">
          <SectionHeader title={t(locale, "home_projects_title")} sub={t(locale, "home_projects_sub")} linkTo="/companies" linkLabel={t(locale, "common_all_companies")} />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Large hero card */}
            <Reveal delay={0} className="md:col-span-2">
              <div className="group relative h-64 md:h-80 rounded-2xl overflow-hidden shadow-bloom card-lift cursor-default">
                <LazyImage
                  src={FEATURED_PROJECTS[0].img}
                  alt={FEATURED_PROJECTS[0].title}
                  wrapperClassName="absolute inset-0"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/72 via-black/20 to-transparent" />
                <div className="absolute bottom-0 left-0 p-6">
                  <span className="inline-block px-3 py-1 bg-secondary text-on-secondary rounded-full text-[11px] font-bold mb-2">{FEATURED_PROJECTS[0].category}</span>
                  <h3 className="text-white font-bold text-[20px] mb-1 drop-shadow">{FEATURED_PROJECTS[0].title}</h3>
                  <p className="text-white/75 text-[13px]">{FEATURED_PROJECTS[0].company}</p>
                </div>
              </div>
            </Reveal>
            {/* 2 small cards */}
            <div className="flex flex-col gap-4">
              {FEATURED_PROJECTS.slice(1, 3).map((p, i) => (
                <Reveal key={p.title} delay={(i + 1) * 80} className="flex-1">
                  <div className="group relative rounded-2xl overflow-hidden shadow-bloom card-lift cursor-default" style={{ height: 148 }}>
                    <LazyImage src={p.img} alt={p.title} wrapperClassName="absolute inset-0" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/68 to-transparent" />
                    <div className="absolute bottom-0 left-0 p-4">
                      <h3 className="text-white font-bold text-[14px] leading-snug">{p.title}</h3>
                      <p className="text-white/65 text-[12px]">{p.company}</p>
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
            {/* Bottom row */}
            {FEATURED_PROJECTS.slice(3).map((p, i) => (
              <Reveal key={p.title} delay={(i + 3) * 70}>
                <div className="group relative h-52 rounded-2xl overflow-hidden shadow-bloom card-lift cursor-default">
                  <LazyImage src={p.img} alt={p.title} wrapperClassName="absolute inset-0" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/68 via-black/10 to-transparent" />
                  <div className="absolute bottom-0 left-0 p-5">
                    <span className="inline-block px-2 py-0.5 bg-white/20 backdrop-blur-sm text-white rounded-full text-[11px] font-bold mb-1.5">{p.category}</span>
                    <h3 className="text-white font-bold text-[17px] leading-snug mb-0.5">{p.title}</h3>
                    <p className="text-white/70 text-[12px]">{p.company}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════
            WHY AL ASSEMA
        ═══════════════════════════════════════════════════ */}
        <section id="about" className="py-14 md:py-20 border-t border-surface-dim/20">
          <SectionHeader title={t(locale, "home_why_title")} sub={t(locale, "home_why_sub")} />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-gutter">
            {[
              { icon: "verified_user", title: t(locale, "home_why_1_title"), desc: t(locale, "home_why_1_desc") },
              { icon: "workspace_premium", title: t(locale, "home_why_2_title"), desc: t(locale, "home_why_2_desc") },
              { icon: "bolt", title: t(locale, "home_why_3_title"), desc: t(locale, "home_why_3_desc") },
              { icon: "support_agent", title: t(locale, "home_why_4_title"), desc: t(locale, "home_why_4_desc") },
            ].map((item, i) => (
              <Reveal key={item.title} delay={i * 90}>
                <div className="bg-surface-container-lowest rounded-2xl p-6 shadow-bloom h-full card-lift">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                    <span className="material-symbols-outlined text-primary text-[24px]"
                      style={{ fontVariationSettings: "'FILL' 1" }}>{item.icon}</span>
                  </div>
                  <h3 className="font-bold text-[17px] text-on-surface mb-2 leading-snug">{item.title}</h3>
                  <p className="text-[14px] text-on-surface-variant leading-relaxed">{item.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════
            REVIEWS
        ═══════════════════════════════════════════════════ */}
        <section id="reviews" className="pt-14 md:pt-20 pb-20 md:pb-28 border-t border-surface-dim/20">
          <div className="flex items-end justify-between mb-8 gap-4 flex-wrap">
            <SectionHeader
              title={t(locale, "home_reviews_title")}
              sub={t(locale, "home_reviews_sub")}
              noMargin
            />
            <button
              onClick={() => reviewsEnabled && setReviewModalOpen(true)}
              disabled={!reviewsEnabled}
              title={!reviewsEnabled ? t(locale, "home_reviews_closed") : undefined}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-[13px] shadow-bloom flex-shrink-0 transition-all duration-200
                ${reviewsEnabled
                  ? "bg-primary text-on-primary hover:bg-primary-container touch-press btn-press"
                  : "bg-surface-container text-outline cursor-not-allowed opacity-55"
                }`}
            >
              <span className="material-symbols-outlined text-[18px]">rate_review</span>
              {t(locale, "home_reviews_share")}
            </button>
          </div>
          <div className="mobile-scroll mobile-bleed md:grid md:grid-cols-3 md:gap-gutter">
            {siteReviews.slice(0, 3).map((r) => (
              <div
                key={r.id}
                className="bg-surface-container-lowest rounded-2xl p-6 shadow-bloom flex flex-col
                           w-[275px] flex-shrink-0 md:w-auto card-lift"
              >
                <Stars n={r.rating} />
                <p className="text-[14px] text-on-surface-variant my-4 flex-grow leading-relaxed">"{r.text}"</p>
                <div className="flex items-center gap-3 pt-4 border-t border-outline-variant/15">
                  <div className="w-10 h-10 rounded-full bg-primary text-on-primary flex items-center justify-center font-bold text-[16px] flex-shrink-0">
                    {r.name.charAt(0)}
                  </div>
                  <div>
                    <p className="font-bold text-[14px] text-on-surface">{r.name}</p>
                    <p className="text-[12px] text-outline">{r.district}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

      <div id="contact" aria-hidden="true" />

      {/* Site review submission modal */}
      {reviewModalOpen && (
        <SiteReviewModal onClose={() => setReviewModalOpen(false)} />
      )}
      </div>{/* /container */}
    </div>
  );
}

// ── Animated stat counter ─────────────────────────────────────────────────
function StatCounter({
  target, suffix = "", label, displayFn,
}: {
  target: number;
  suffix?: string;
  label: string;
  displayFn?: (n: number) => string;
}) {
  const { ref, count } = useCountUp(target);
  const display = displayFn ? displayFn(count) : `${count}${suffix}`;
  return (
    <div ref={ref} className="fade-up">
      <div className="text-primary font-black tabular-nums leading-none mb-2
                      text-[2.2rem] md:text-[3rem] tracking-tight">
        {display}
      </div>
      <div className="text-outline font-bold text-[11px] uppercase tracking-[0.1em] leading-tight">{label}</div>
    </div>
  );
}

// ── Section header ────────────────────────────────────────────────────────
function SectionHeader({ title, sub, linkTo, linkLabel, noMargin }: {
  title: string; sub: string; linkTo?: string; linkLabel?: string; noMargin?: boolean;
}) {
  const ref = useReveal();
  if (noMargin) {
    return (
      <div ref={ref} className="fade-up">
        <h2 className="text-[22px] md:text-headline-lg font-black text-on-surface mb-1.5 tracking-tight leading-snug">{title}</h2>
        <p className="text-[14px] md:text-body-lg text-outline max-w-2xl leading-relaxed">{sub}</p>
      </div>
    );
  }
  return (
    <div ref={ref} className="fade-up flex justify-between items-end mb-7 flex-wrap gap-3">
      <div>
        <h2 className="text-[22px] md:text-headline-lg font-black text-on-surface mb-1.5 tracking-tight leading-snug">{title}</h2>
        <p className="text-[14px] md:text-body-lg text-outline max-w-2xl leading-relaxed">{sub}</p>
      </div>
      {linkTo && linkLabel && (
        <Link to={linkTo} className="hidden sm:flex items-center text-primary font-bold text-[14px] hover:text-primary-container transition-colors shrink-0">
          {linkLabel} <span className="material-symbols-outlined ms-1 text-[16px] rtl-flip">arrow_forward</span>
        </Link>
      )}
    </div>
  );
}

// ── Site review submission modal ──────────────────────────────────────────────
function SiteReviewModal({ onClose }: { onClose: () => void }) {
  const { locale } = useLocale();
  const [name, setName] = useState("");
  const [district, setDistrict] = useState("");
  const [rating, setRating] = useState(5);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Focus trap + Escape. Block close (Esc, backdrop, X) while a submit is
  // in-flight so the user can't accidentally lose a review mid-send.
  const { containerRef, trapTab } = useDialogA11y(true, () => { if (!isSubmitting) onClose(); });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError(t(locale, "review_err_name")); return; }
    if (!text.trim()) { setError(t(locale, "review_err_text")); return; }
    setIsSubmitting(true);
    setError("");
    try {
      await addSiteReview({ name: name.trim(), district: district.trim() || "NAC", rating, text: text.trim() });
      setSubmitted(true);
    } catch {
      setError("Couldn't submit your review. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-on-background/45 backdrop-blur-sm"
      onClick={() => { if (!isSubmitting) onClose(); }}>
      <div ref={containerRef} onKeyDown={trapTab} role="dialog" aria-modal aria-label={t(locale, "review_modal_title")}
        className="bg-surface-container-lowest w-full max-w-md rounded-2xl shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant/20">
          <h2 className="font-bold text-[17px] text-on-surface">{t(locale, "review_modal_title")}</h2>
          <button onClick={onClose} disabled={isSubmitting} aria-label={t(locale, "common_close")}
            className="p-1.5 rounded-lg hover:bg-surface-container transition-colors disabled:opacity-40">
            <span className="material-symbols-outlined text-outline">close</span>
          </button>
        </div>
        <div className="p-5">
          {submitted ? (
            <div className="text-center py-6">
              <span className="material-symbols-outlined text-primary text-[48px] mb-3 block" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
              <p className="font-bold text-[17px] text-on-surface mb-1">{t(locale, "review_thanks")}</p>
              <p className="text-[14px] text-outline mb-5">{t(locale, "review_thanks_sub")}</p>
              <button onClick={onClose} className="bg-primary text-on-primary px-6 py-2.5 rounded-xl font-bold text-[14px] hover:bg-primary-container transition-colors touch-press btn-press">{t(locale, "common_close")}</button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Star rating */}
              <div>
                <label className="block text-[12px] font-bold text-on-surface mb-2">{t(locale, "review_rating")}</label>
                <div className="flex gap-1.5">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <button key={s} type="button" onClick={() => setRating(s)} disabled={isSubmitting}
                      aria-label={`${s}`}
                      className="material-symbols-outlined text-[28px] text-secondary transition-all hover:scale-110 disabled:opacity-60"
                      style={{ fontVariationSettings: s <= rating ? "'FILL' 1" : "'FILL' 0" }}>
                      star
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[12px] font-bold text-on-surface mb-1">{t(locale, "review_your_name")} <span className="text-error">*</span></label>
                  <input disabled={isSubmitting} className="field-input !py-2 text-[13px] disabled:opacity-60" placeholder={t(locale, "review_name_ph")} value={name} onChange={(e) => { setName(e.target.value); setError(""); }} />
                </div>
                <div>
                  <label className="block text-[12px] font-bold text-on-surface mb-1">{t(locale, "review_district")}</label>
                  <input disabled={isSubmitting} className="field-input !py-2 text-[13px] disabled:opacity-60" placeholder={t(locale, "review_district_ph")} value={district} onChange={(e) => setDistrict(e.target.value)} />
                </div>
              </div>
              <div>
                <label className="block text-[12px] font-bold text-on-surface mb-1">{t(locale, "review_your_review")} <span className="text-error">*</span></label>
                <textarea disabled={isSubmitting} className={`field-input resize-none disabled:opacity-60 ${error && !text.trim() ? "error" : ""}`} rows={4}
                  placeholder={t(locale, "review_text_ph")}
                  value={text} onChange={(e) => { setText(e.target.value); setError(""); }} />
              </div>
              {error && <p className="text-[12px] text-error font-bold">{error}</p>}
              <button type="submit" disabled={isSubmitting}
                className="w-full bg-primary text-on-primary py-3 rounded-xl font-bold text-[14px] hover:bg-primary-container transition-all touch-press btn-press disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                {isSubmitting ? (
                  <>
                    <span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>
                    {t(locale, "review_submitting")}
                  </>
                ) : t(locale, "review_submit")}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
