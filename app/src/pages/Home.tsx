import { Link } from "react-router-dom";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useCompanies, useCategoriesWithCounts, useCatalogStatus, useFeaturedProjects } from "../lib/catalog";
import { isBusy } from "../lib/availability";
import { CompanyCardSkeleton } from "../components/Skeleton";
import { useSiteReviews, useReviewsEnabled, addSiteReview } from "../lib/siteReviews";
import { useCountUp } from "../hooks/useCountUp";
import { useReveal } from "../hooks/useReveal";
import { useScrollDots } from "../hooks/useScrollDots";
import Stars from "../components/Stars";
import LazyImage from "../components/LazyImage";
import ScrollDots from "../components/ScrollDots";
import { usePageMeta } from "../hooks/usePageMeta";
import Modal from "../components/Modal";
import { useLocale } from "../context/LocaleContext";
import { t, tCount } from "../lib/i18n";
import { formatRating } from "../lib/format";
import Captcha from "../components/Captcha";
import { captchaConfigured } from "../lib/captcha";
import { useSettings } from "../lib/settings";
import Icon from "../components/Icon";

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
// Built-in default; admins can override via Settings → branding (hero_image_url).
const HERO = "/img/seed-16.jpg";

// ═══════════════════════════════════════════════════════════════════════════
export default function Home() {
  usePageMeta();
  const { locale } = useLocale();
  const COMPANIES = useCompanies();
  const SERVICE_CATEGORIES = useCategoriesWithCounts();
  const status = useCatalogStatus();
  const loadingEmpty = status === "loading" && COMPANIES.length === 0;
  const featuredCompanies = COMPANIES.filter((c) => c.featured !== false);
  // RESP-04: scroll-position dots for the two mobile horizontal-scroll strips below.
  const categoriesScroll = useScrollDots<HTMLDivElement>(SERVICE_CATEGORIES.length);
  const companiesScroll = useScrollDots<HTMLDivElement>(loadingEmpty ? 3 : featuredCompanies.length);
  const siteReviews = useSiteReviews();
  const reviewsEnabled = useReviewsEnabled();
  const featured = useFeaturedProjects();
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  // HOME-07: hover-only pause isn't a real pause mechanism (WCAG 2.2.2) —
  // this is the explicit, persistent toggle.
  const [marqueePaused, setMarqueePaused] = useState(false);

  // Admin-editable hero copy (per locale); blank → the localized i18n defaults.
  const settings = useSettings();
  const heroTitleOverride = (locale === "ar" ? settings.hero_title_ar : settings.hero_title_en).trim();
  const heroSubOverride = (locale === "ar" ? settings.hero_subtitle_ar : settings.hero_subtitle_en).trim();
  const heroImage = settings.hero_image_url.trim() || HERO;

  // Average customer rating — derived from live company ratings (×10 so the
  // counter can animate an integer), not a hardcoded number.
  const avgRating10 = COMPANIES.length
    ? Math.round((COMPANIES.reduce((s, c) => s + c.rating, 0) / COMPANIES.length) * 10)
    : 0;

  function scrollTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  }

  // HOME-12: the cue says "scroll down" — it should stop saying that once
  // the visitor already has.
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        setScrolled(window.scrollY > 10);
        ticking = false;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="bg-surface text-on-surface overflow-x-hidden">

      {/* ═══════════════════════════════════════════════════
          HERO — full-screen NAC skyline
      ═══════════════════════════════════════════════════ */}
      {/* RootLayout skips <main>'s nav-clearance padding on "/" (NAV-01) so this
          full-bleed hero starts at the very top of the viewport, behind the
          transparent nav — every other page wants the padding, this one
          doesn't. */}
      <header className="h-hero relative w-full min-h-[640px] max-h-[900px] flex items-center justify-center overflow-hidden">
        {/* Background — eager loaded, above the fold. object-top (not center):
            the hero is capped at max-h-[900px] while the source image is a 16:9
            skyline shot, so on any viewport wider than ~16:9 (most laptops,
            all ultra-wides) object-fit:cover has to crop the vertical axis.
            Anchoring to the top keeps that crop entirely inside the plaza/
            palm-tree foreground at the bottom and never touches the tower —
            the actual focal point — which object-center was eating into. */}
        <img
          src={heroImage}
          alt={t(locale, "home_hero_alt")}
          loading="eager"
          decoding="async"
          width={1920}
          height={900}
          className="absolute inset-0 w-full h-full object-cover object-top"
        />
        <div className="absolute inset-0 hero-scrim" />

        {/* Content */}
        <div className="relative z-10 text-center px-5 md:px-8 max-w-4xl mx-auto w-full mt-16 md:mt-20">
          <h1
            className="text-white font-black mb-6 tracking-tight
                       text-[2.4rem] leading-[1.12]
                       md:text-[3.75rem] md:leading-[1.08]
                       max-w-3xl mx-auto"
            style={{ textShadow: "0 2px 20px rgba(0,0,0,0.55), 0 1px 4px rgba(0,0,0,0.4)" }}
          >
            {heroTitleOverride ? (
              heroTitleOverride
            ) : (
              <>
                {t(locale, "home_hero_title_1")}<br className="hidden md:block" />{" "}
                {t(locale, "home_hero_title_2")}
              </>
            )}
          </h1>
          <p
            className="text-white/95 mb-10 max-w-lg mx-auto
                       text-body md:text-subhead leading-[1.75] font-medium"
            style={{ textShadow: "0 1px 8px rgba(0,0,0,0.45)" }}
          >
            {heroSubOverride || t(locale, "home_hero_sub")}
          </p>

          {/* CTA buttons */}
          <div className="flex flex-col items-center sm:flex-row sm:justify-center gap-3 sm:gap-4">
            {/* Primary CTA */}
            <button
              onClick={() => scrollTo("services")}
              className="w-[85%] sm:w-auto bg-primary text-on-primary px-9 py-[17px] sm:py-[15px] rounded-full
                         font-bold text-body ltr:tracking-wide
                         shadow-[0_4px_24px_rgba(0,85,120,0.45),0_1px_4px_rgba(0,0,0,0.2)]
                         hover:brightness-110 hover:shadow-[0_8px_32px_rgba(0,85,120,0.55),0_2px_8px_rgba(0,0,0,0.25)]
                         hover:scale-[1.02] active:scale-[0.98]
                         transition duration-base ease-out touch-press btn-press"
            >
              {t(locale, "home_cta_explore")}
            </button>

            {/* Glass CTA */}
            <button
              onClick={() => scrollTo("companies")}
              className="group w-[85%] sm:w-auto flex items-center justify-center gap-2.5
                         px-9 py-[17px] sm:py-[15px] rounded-full
                         bg-white/[0.12] backdrop-blur-[20px]
                         border border-white/35
                         shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_4px_24px_rgba(0,0,0,0.2)]
                         text-white font-semibold text-body ltr:tracking-wide
                         hover:bg-white/[0.22] hover:border-white/50
                         hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_8px_32px_rgba(0,0,0,0.3)]
                         hover:scale-[1.02] active:scale-[0.98]
                         transition duration-base ease-out touch-press"
            >
              {t(locale, "home_cta_browse")}
              <Icon name="arrow_forward" className="text-subhead opacity-75 rtl-flip group-hover:translate-x-1 rtl:group-hover:-translate-x-1 transition-transform duration-base" />
            </button>
          </div>
        </div>

        {/* Scroll cue — hidden once the visitor has already scrolled (HOME-12) */}
        <button
          onClick={() => scrollTo("stats")}
          className={`absolute bottom-8 left-1/2 -translate-x-1/2 text-white flex flex-col items-center gap-1 animate-float transition-opacity duration-base
            ${scrolled ? "opacity-0 pointer-events-none" : "opacity-75 hover:opacity-100"}`}
          aria-hidden={scrolled}
          tabIndex={scrolled ? -1 : 0}
        >
          <span className="text-caption font-bold ltr:tracking-[0.15em] ltr:uppercase">{t(locale, "home_scroll")}</span>
          <Icon name="expand_more" className="text-headline" />
        </button>
      </header>

      {/* ═══════════════════════════════════════════════════
          STATS — animated counters
      ═══════════════════════════════════════════════════ */}
      <section
        id="stats"
        className="bg-surface-container-lowest border-b border-surface-dim/20
                   relative rounded-t-3xl -mt-6 z-10 py-10 md:py-14"
      >
        <div className="max-w-container-max mx-auto px-margin-mobile md:px-margin-desktop">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-10 text-center">
            <StatCounter target={COMPANIES.length} label={t(locale, "home_stat_partners")} />
            <StatCounter target={COMPANIES.reduce((s, c) => s + c.completedProjects, 0)} label={t(locale, "home_stat_projects")} />
            <StatCounter target={avgRating10} label={t(locale, "home_stat_rating")} displayFn={(n) => (n / 10).toFixed(1)} icon="star" />
            <StatCounter target={SERVICE_CATEGORIES.length} label={t(locale, "home_stat_categories")} />
          </div>
        </div>
      </section>

      <div className="max-w-container-max mx-auto px-margin-mobile md:px-margin-desktop">

        {/* ═══════════════════════════════════════════════════
            SERVICES
        ═══════════════════════════════════════════════════ */}
        {/* scroll-mt on every #anchor target below: TopNav is `fixed top-0`,
            so `scrollIntoView({block:"start"})` — what useHashScroll calls, and
            what the browser does for a `/#reviews` deep link — parks the
            heading UNDER the nav bar. The Footer's "Customer Reviews" link and
            the mobile menu's "Reviews" both land here. Same values
            CompanyProfile.tsx already uses for its own six sections. */}
        <section id="services" className="scroll-mt-20 md:scroll-mt-24 pt-10 md:pt-14 pb-14 md:pb-20">
          <SectionHeader
            title={t(locale, "home_services_title")}
            sub={t(locale, "home_services_sub")}
            linkTo="/services"
            linkLabel={t(locale, "home_services_link")}
          />
          {/* Mobile: horizontal scroll | Desktop: grid */}
          <div ref={categoriesScroll.ref} className="mobile-scroll mobile-bleed md:grid md:grid-cols-3 md:gap-gutter">
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
                  className="w-full h-full object-cover group-hover:scale-[1.05] transition-transform duration-slow ease-out"
                  width={240}
                  height={208}
                />
                {/* Premium scrim — bottom always darker than top */}
                <div className="absolute inset-0 card-scrim" />
                <div className="absolute inset-0 card-scrim-hover" />
                <div className="absolute inset-x-0 bottom-0 p-5 pb-6 md:pb-5">
                  {/* Glass icon circle */}
                  <div className="bg-white/15 backdrop-blur-md border border-white/25 rounded-full p-2 inline-flex mb-3 shadow-lg">
                    <span className="material-symbols-outlined text-white text-subhead"
                      style={{ fontVariationSettings: "'FILL' 1" }} aria-hidden="true" translate="no">{cat.icon}</span>
                  </div>
                  <h3 className="text-white font-extrabold text-subhead md:text-subhead leading-snug mb-1.5 text-shadow-soft">{cat.label}</h3>
                  <p className="text-white/80 text-label md:text-caption font-medium text-shadow-soft">{cat.count} {t(locale, "home_companies_label")}</p>
                </div>
              </Link>
            ))}
          </div>
          <div className="md:hidden">
            <ScrollDots count={categoriesScroll.dotCount} active={categoriesScroll.active} />
          </div>
          <div className="mt-5 md:hidden text-center">
            <Link to="/services" className="text-primary font-bold text-label inline-flex items-center gap-1 hover:underline">
              {t(locale, "common_all_categories")} <Icon name="arrow_forward" className="text-body rtl-flip" />
            </Link>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════
            COMPANIES
        ═══════════════════════════════════════════════════ */}
        <section id="companies" className="scroll-mt-20 md:scroll-mt-24 py-14 md:py-20 border-t border-surface-dim/20 bg-gradient-to-br from-primary/[0.06] via-background to-secondary/[0.04]">
          <SectionHeader
            title={t(locale, "home_companies_title")}
            sub={t(locale, "home_companies_sub")}
            linkTo="/companies"
            linkLabel={t(locale, "home_companies_link")}
          />
          {/* Mobile: horizontal scroll | Desktop: grid */}
          <div ref={companiesScroll.ref} className="mobile-scroll mobile-bleed md:grid md:grid-cols-3 md:gap-gutter">
            {loadingEmpty ? Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="w-[275px] flex-shrink-0 md:w-auto"><CompanyCardSkeleton /></div>
            )) : featuredCompanies.map((c) => (
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
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-slow"
                    width={275}
                    height={160}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                  {/* Logo — mirrored in RTL, matching the same card on
                      /companies (Companies.tsx) and /services (Services.tsx).
                      Without the rtl: overrides these three overlays were the
                      only company card on the site that did NOT flip, so the
                      homepage read back-to-front in Arabic, the default locale. */}
                  <div className="absolute top-4 left-4 rtl:left-auto rtl:right-4 z-10 w-12 h-12 rounded-xl overflow-hidden
                                  border-2 border-white shadow-md bg-white">
                    <img src={c.logo} alt="" className="w-full h-full object-cover" loading="lazy" width={48} height={48} />
                  </div>
                  {/* Verified */}
                  {c.verified && (
                    <div className="absolute top-2.5 right-2.5 rtl:right-auto rtl:left-2.5 flex items-center gap-1 bg-white/90 backdrop-blur-sm px-2 py-1 rounded-full shadow-sm">
                      <Icon name="verified" className="text-primary text-caption" style={{ fontVariationSettings: "'FILL' 1" }} />
                      <span className="text-caption font-bold text-primary">{t(locale, "common_verified")}</span>
                    </div>
                  )}
                  {isBusy(c) && (
                    <span className="absolute bottom-2.5 left-2.5 rtl:left-auto rtl:right-2.5 z-10 flex items-center gap-1 bg-amber-500 text-white text-caption font-bold px-2 py-0.5 rounded-full shadow-md">
                      <Icon name="event_busy" className="text-caption" style={{ fontVariationSettings: "'FILL' 1" }} />
                      {t(locale, "busy_badge")}
                    </span>
                  )}
                </div>

                {/* Info */}
                <div className="pt-8 px-4 pb-4 flex flex-col flex-grow">
                  <h3 className="font-bold text-subhead text-on-surface group-hover:text-primary transition-colors mb-0.5 leading-snug">{c.name}</h3>
                  <p className="text-caption font-bold text-outline mb-2">{c.categoryLabel}</p>
                  <div className="flex items-center gap-1.5 mb-2">
                    <Stars n={Math.round(c.rating)} />
                    <span className="font-bold text-label text-on-surface">{formatRating(locale, c.rating)}</span>
                    <span className="text-outline text-caption">({c.reviewCount})</span>
                  </div>
                  <p className="text-label text-on-surface-variant leading-relaxed line-clamp-2 flex-grow">{c.tagline}</p>
                  <div className="mt-3 pt-3 border-t border-outline-variant/15 flex items-center justify-between">
                    <span className="text-caption text-outline">{c.completedProjects} {tCount(locale, "noun_project", c.completedProjects)}</span>
                    <span className="text-primary text-label font-bold flex items-center gap-0.5 group-hover:translate-x-1 transition-transform">
                      {t(locale, "home_view")} <Icon name="arrow_forward" className="text-label rtl-flip" />
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
          <div className="md:hidden">
            <ScrollDots count={companiesScroll.dotCount} active={companiesScroll.active} />
          </div>
          <div className="mt-5 md:hidden text-center">
            <Link to="/companies" className="text-primary font-bold text-label inline-flex items-center gap-1 hover:underline">
              {t(locale, "common_all_companies")} <Icon name="arrow_forward" className="text-body rtl-flip" />
            </Link>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════
            PROJECTS
        ═══════════════════════════════════════════════════ */}
        <section id="projects" className="scroll-mt-20 md:scroll-mt-24 py-14 md:py-20 border-t border-surface-dim/20">
          <SectionHeader title={t(locale, "home_projects_title")} sub={t(locale, "home_projects_sub")} linkTo="/companies" linkLabel={t(locale, "common_all_companies")} />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Large hero card */}
            <Reveal delay={0} className="md:col-span-2">
              <div className="group relative h-64 md:h-80 rounded-2xl overflow-hidden shadow-bloom cursor-default">
                <LazyImage
                  src={featured[0].img}
                  alt={featured[0].title}
                  wrapperClassName="absolute inset-0"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-slow"
                  width={700}
                  height={320}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/72 via-black/20 to-transparent" />
                {/* start-0, not left-0: this caption block is TEXT over an image,
                  so it belongs on the side the reading starts from. Pinned
                  physically left, the Arabic homepage put its project titles
                  hard against the left edge, ragged away from the reader. */}
              <div className="absolute bottom-0 start-0 p-6">
                  <span className="inline-block px-3 py-1 bg-secondary text-on-secondary rounded-full text-caption font-bold mb-2">{featured[0].category}</span>
                  <h3 className="text-white font-bold text-title mb-1 drop-shadow">{featured[0].title}</h3>
                  <p className="text-white/75 text-label">{featured[0].company}</p>
                </div>
              </div>
            </Reveal>
            {/* 2 small cards */}
            <div className="flex flex-col gap-4">
              {featured.slice(1, 3).map((p, i) => (
                <Reveal key={p.title} delay={(i + 1) * 80} className="flex-1">
                  {/* HOME-06: fixed height matching the hero card's own
                      256px/320px minus gap, split across 2 rows — an actual
                      layout constant, not an ad-hoc inline style. */}
                  <div className="group relative h-[148px] rounded-2xl overflow-hidden shadow-bloom cursor-default">
                    <LazyImage src={p.img} alt={p.title} wrapperClassName="absolute inset-0" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-slow" width={340} height={148} />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/68 to-transparent" />
                    <div className="absolute bottom-0 start-0 p-4">
                      <h3 className="text-white font-bold text-label leading-snug">{p.title}</h3>
                      <p className="text-white/65 text-caption">{p.company}</p>
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
            {/* Bottom row */}
            {featured.slice(3).map((p, i) => (
              <Reveal key={p.title} delay={(i + 3) * 70}>
                <div className="group relative h-52 rounded-2xl overflow-hidden shadow-bloom cursor-default">
                  <LazyImage src={p.img} alt={p.title} wrapperClassName="absolute inset-0" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-slow" width={340} height={208} />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/68 via-black/10 to-transparent" />
                  <div className="absolute bottom-0 start-0 p-5">
                    <span className="inline-block px-2 py-0.5 bg-white/20 backdrop-blur-sm text-white rounded-full text-caption font-bold mb-1.5">{p.category}</span>
                    <h3 className="text-white font-bold text-subhead leading-snug mb-0.5">{p.title}</h3>
                    <p className="text-white/70 text-caption">{p.company}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════
            WHY AL ASSEMA
        ═══════════════════════════════════════════════════ */}
        <section id="about" className="scroll-mt-20 md:scroll-mt-24 py-14 md:py-20 border-t border-surface-dim/20">
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
                    <span className="material-symbols-outlined text-primary text-title"
                      style={{ fontVariationSettings: "'FILL' 1" }} aria-hidden="true" translate="no">{item.icon}</span>
                  </div>
                  <h3 className="font-bold text-subhead text-on-surface mb-2 leading-snug">{item.title}</h3>
                  <p className="text-label text-on-surface-variant leading-relaxed">{item.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════
            REVIEWS
        ═══════════════════════════════════════════════════ */}
        <section id="reviews" className="scroll-mt-20 md:scroll-mt-24 pt-14 md:pt-20 pb-20 md:pb-28 border-t border-surface-dim/20">
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
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-label shadow-bloom flex-shrink-0 transition-colors duration-base
                ${reviewsEnabled
                  ? "bg-primary text-on-primary hover:bg-primary-container touch-press btn-press"
                  : "bg-surface-container text-outline cursor-not-allowed opacity-55"
                }`}
            >
              <Icon name="rate_review" className="text-subhead" />
              {t(locale, "home_reviews_share")}
            </button>
          </div>
          {/* Continuous right-to-left marquee of ALL approved reviews. One "loop" is
              repeated until it comfortably overflows the widest screen, then the whole
              loop is duplicated once so the -50% wrap is seamless with no empty gap on
              the right (see .review-marquee CSS). Speed scales with the loop length. */}
          {siteReviews.length > 0 && (() => {
            // Ensure a single loop has enough cards to exceed a wide viewport, so the
            // right edge never runs dry before the animation repeats.
            const MIN_LOOP_CARDS = 8;
            const reps = Math.max(1, Math.ceil(MIN_LOOP_CARDS / siteReviews.length));
            const loop = Array.from({ length: reps }, () => siteReviews).flat();
            const track = [...loop, ...loop]; // duplicated → seamless translateX(-50%)
            return (
              <>
                <div className="flex justify-end mb-2">
                  <button
                    onClick={() => setMarqueePaused((p) => !p)}
                    aria-pressed={marqueePaused}
                    className="flex items-center gap-1.5 text-caption font-bold text-outline hover:text-primary transition-colors px-2 py-1 -my-1 rounded-lg"
                  >
                    <Icon name={marqueePaused ? "play_arrow" : "pause"} className="text-label" />
                    {t(locale, marqueePaused ? "home_reviews_play" : "home_reviews_pause")}
                  </button>
                </div>
                <div className={`review-marquee -mx-margin-mobile md:-mx-margin-desktop px-margin-mobile md:px-margin-desktop ${marqueePaused ? "review-marquee--paused" : ""}`}>
                <div
                  className="review-marquee-track py-2"
                  style={{ animationDuration: `${loop.length * 6}s` }}
                >
                  {track.map((r, i) => {
                    const isDuplicate = i >= loop.length;
                    return (
                      <div
                        key={`${r.id}-${i}`}
                        aria-hidden={isDuplicate ? true : undefined}
                        tabIndex={isDuplicate ? -1 : 0}
                        className="review-card bg-surface-container-lowest rounded-2xl p-6 shadow-bloom flex flex-col
                                   w-[280px] md:w-[340px] flex-shrink-0"
                      >
                        <Stars n={r.rating} />
                        <p className="text-label text-on-surface-variant my-4 flex-grow leading-relaxed line-clamp-5">"{r.text}"</p>
                        <div className="flex items-center gap-3 pt-4 border-t border-outline-variant/15">
                          <div className="w-10 h-10 rounded-full bg-primary text-on-primary flex items-center justify-center font-bold text-body flex-shrink-0">
                            {r.name.charAt(0)}
                          </div>
                          <div>
                            <p className="font-bold text-label text-on-surface">{r.name}</p>
                            <p className="text-caption text-outline">{r.district}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                </div>
              </>
            );
          })()}
        </section>

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
  target, suffix = "", label, displayFn, icon,
}: {
  target: number;
  suffix?: string;
  label: string;
  displayFn?: (n: number) => string;
  /** HOME-04: was a "★" glyph concatenated into the number string — not
   *  localizable, and a screen reader read the whole thing as "4.8 black
   *  star". A real icon next to the number instead. */
  icon?: string;
}) {
  const { ref, count } = useCountUp(target);
  const display = displayFn ? displayFn(count) : `${count}${suffix}`;
  return (
    <div ref={ref} className="fade-up">
      <div className="text-primary font-black tabular-nums leading-none mb-2
                      text-[2.2rem] md:text-[3rem] tracking-tight flex items-center justify-center gap-1.5">
        {display}
        {icon && <Icon name={icon} className="text-[1.5rem] md:text-[2rem]" fill />}
      </div>
      <div className="text-outline font-bold text-caption ltr:uppercase ltr:tracking-[0.1em] leading-tight">{label}</div>
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
        <h2 className="text-title md:text-display font-black text-on-surface mb-1.5 tracking-tight leading-snug">{title}</h2>
        <p className="text-label md:text-subhead text-outline max-w-2xl leading-relaxed">{sub}</p>
      </div>
    );
  }
  return (
    <div ref={ref} className="fade-up flex justify-between items-end mb-7 flex-wrap gap-3">
      <div>
        <h2 className="text-title md:text-display font-black text-on-surface mb-1.5 tracking-tight leading-snug">{title}</h2>
        <p className="text-label md:text-subhead text-outline max-w-2xl leading-relaxed">{sub}</p>
      </div>
      {linkTo && linkLabel && (
        <Link to={linkTo} className="hidden sm:flex items-center text-primary font-bold text-label hover:text-primary-container transition-colors shrink-0">
          {linkLabel} <Icon name="arrow_forward" className="ms-1 text-body rtl-flip" />
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
  // Which field the current error belongs to — lets aria-invalid/aria-describedby
  // land on the field that's actually wrong instead of always the textarea
  // (FORM-02: a name error used to show no field-level marker at all).
  const [errorField, setErrorField] = useState<"name" | "text" | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaReset, setCaptchaReset] = useState(0);
  const nameId = useId();
  const textId = useId();
  const errorId = useId();
  const nameRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError(t(locale, "review_err_name")); setErrorField("name"); nameRef.current?.focus(); return; }
    if (!text.trim()) { setError(t(locale, "review_err_text")); setErrorField("text"); textRef.current?.focus(); return; }
    if (captchaConfigured() && !captchaToken) { setError(t(locale, "form_err_captcha")); setErrorField(null); return; }
    setIsSubmitting(true);
    setError("");
    setErrorField(null);
    try {
      await addSiteReview({ name: name.trim(), district: district.trim() || "NAC", rating, text: text.trim() }, "", captchaToken);
      setSubmitted(true);
    } catch {
      setError(t(locale, "lead_review_error"));
      setCaptchaToken(null);
      setCaptchaReset((n) => n + 1);
    } finally {
      setIsSubmitting(false);
    }
  }

  return createPortal(
    <Modal
      onClose={() => { if (!isSubmitting) onClose(); }}
      title={t(locale, "review_modal_title")}
      closeDisabled={isSubmitting}
    >
        <div className="p-5">
          {submitted ? (
            <div className="text-center py-6">
              <Icon name="check_circle" className="text-primary text-[48px] mb-3 block" style={{ fontVariationSettings: "'FILL' 1" }} />
              <p className="font-bold text-subhead text-on-surface mb-1">{t(locale, "review_thanks")}</p>
              <p className="text-label text-outline mb-5">{t(locale, "review_thanks_sub")}</p>
              <button onClick={onClose} className="bg-primary text-on-primary px-6 py-2.5 rounded-xl font-bold text-label hover:bg-primary-container transition-colors touch-press btn-press">{t(locale, "common_close")}</button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Star rating */}
              <div>
                <label className="block text-caption font-bold text-on-surface mb-2">{t(locale, "review_rating")}</label>
                <div className="flex gap-1.5">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <button key={s} type="button" onClick={() => setRating(s)} disabled={isSubmitting}
                      aria-label={`${s}`}
                      className="transition hover:scale-110 disabled:opacity-60">
                      <Icon name="star" className="text-headline text-secondary" style={{ fontVariationSettings: s <= rating ? "'FILL' 1" : "'FILL' 0" }} />
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor={nameId} className="block text-caption font-bold text-on-surface mb-1">{t(locale, "review_your_name")} <span className="text-error">*</span></label>
                  <input
                    id={nameId}
                    ref={nameRef}
                    aria-invalid={errorField === "name"}
                    aria-describedby={errorField === "name" ? errorId : undefined}
                    disabled={isSubmitting}
                    className={`field-input !py-2 text-label disabled:opacity-60 ${errorField === "name" ? "error" : ""}`}
                    placeholder={t(locale, "review_name_ph")}
                    value={name}
                    onChange={(e) => { setName(e.target.value); setError(""); setErrorField(null); }}
                  />
                </div>
                <div>
                  <label className="block text-caption font-bold text-on-surface mb-1">{t(locale, "review_district")}</label>
                  <input disabled={isSubmitting} className="field-input !py-2 text-label disabled:opacity-60" placeholder={t(locale, "review_district_ph")} value={district} onChange={(e) => setDistrict(e.target.value)} />
                </div>
              </div>
              <div>
                <label htmlFor={textId} className="block text-caption font-bold text-on-surface mb-1">{t(locale, "review_your_review")} <span className="text-error">*</span></label>
                <textarea
                  id={textId}
                  ref={textRef}
                  aria-invalid={errorField === "text"}
                  aria-describedby={errorField === "text" ? errorId : undefined}
                  disabled={isSubmitting}
                  className={`field-input resize-none disabled:opacity-60 ${errorField === "text" ? "error" : ""}`}
                  rows={4}
                  placeholder={t(locale, "review_text_ph")}
                  value={text}
                  onChange={(e) => { setText(e.target.value); setError(""); setErrorField(null); }}
                />
              </div>
              {error && <p id={errorId} role="alert" className="text-caption text-error font-bold">{error}</p>}
              <Captcha onToken={setCaptchaToken} resetSignal={captchaReset} />
              <button type="submit" disabled={isSubmitting}
                className="w-full bg-primary text-on-primary py-3 rounded-xl font-bold text-label hover:bg-primary-container transition touch-press btn-press disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                {isSubmitting ? (
                  <>
                    <Icon name="progress_activity" className="text-subhead animate-spin" />
                    {t(locale, "review_submitting")}
                  </>
                ) : t(locale, "review_submit")}
              </button>
            </form>
          )}
        </div>
    </Modal>,
    document.body
  );
}
