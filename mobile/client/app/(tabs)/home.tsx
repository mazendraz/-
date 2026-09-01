import { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import type { ApiCategory, ApiCompany, ApiSiteReview } from "@alassema/core";
import { colors, type } from "@alassema/core";
import Icon, { toIconName } from "../../components/Icon";
import Logo from "../../components/Logo";
import SiteReviewModal from "../../components/SiteReviewModal";
import ReviewsMarquee from "../../components/ReviewsMarquee";
import { fetchCategories } from "../../lib/categories";
import { fetchCompanies } from "../../lib/companies";
import {
  isApiConfigured,
  rowStart,
  useRefreshOnFocus,
  refreshSettings,
  useSettings,
  assetUri,
  firstAssetUri,
} from "@alassema/mobile-shared";
import { fetchFeaturedProjects, type FeaturedProject } from "../../lib/projects";
import { fetchSiteReviews, fetchSiteReviewSettings } from "../../lib/siteReviews";
import { useCountUp } from "../../lib/useCountUp";

// The mobile app's own hero photo — a tall tower render, bundled into the
// binary. Used whenever the admin hasn't set a custom hero_image_url, same
// fallback pattern as the website's `settings.hero_image_url.trim() ||
// HERO`, just a different source image (mobile asked for its own full,
// large tower shot rather than the website's wide skyline crop).
const DEFAULT_HERO = require("../../assets/hero-tower.jpg");

// Website's TopNav treats the customer as "scrolled past the hero" at 60px
// (see TopNav.tsx's `setScrolled(y > 60)`) — same threshold here.
const SCROLL_SOLID_THRESHOLD = 60;

// The tower photo is a tall portrait (853×1844, aspect ≈0.46) — meant to
// read as one big, immersive shot of the building, not a thin banner strip.
// Size the hero as a healthy share of the actual screen height instead of a
// small fixed pixel height, clamped so it stays sane on very short/tall
// devices.
const HERO_HEIGHT_RATIO = 0.86;
// NOT the website's `min-h-[640px]` floor, despite the shared max — that
// number exists there to protect a desktop browser window that can be
// resized arbitrarily short, a case a phone viewport never has (its height
// IS the screen). Copied over verbatim it did the opposite job on a phone: on
// a 667pt device (iPhone SE, still a real target) the intended
// 0.86 × 667 ≈ 573 was clamped UP to 640 — 96% of the whole screen — pushing
// the stat counters, the four reasons, and the featured-companies rail
// entirely below the fold on first paint, the screen that most needs to
// sell. This floor only exists for genuinely unusual short viewports
// (a foldable, split-screen multitasking); on every normal phone the ratio
// alone decides the height.
const HERO_MIN_HEIGHT = 420;
const HERO_MAX_HEIGHT = 900;

// Same 4 reasons, same copy as the website's home_why_1..4 i18n strings
// (i18n.ts) — previously 3 hand-written reasons that drifted from both the
// website's count and its wording.
const REASONS = [
  { icon: "verified_user" as const, title: "اختيار منتقى", desc: "كل شركة يتم تدقيقها يدويًا. بدون تسجيل مفتوح، بدون مجهولين." },
  { icon: "workspace_premium" as const, title: "جودة متميزة", desc: "فقط شركات بسجل أداء مثبت في العاصمة الجديدة." },
  { icon: "bolt" as const, title: "طلب فوري", desc: "أرسل طلبك في أقل من دقيقة، وتابعه من أي جهاز تسجّل دخولك عليه." },
  { icon: "support_agent" as const, title: "دعم مخصّص", desc: "فريقنا يتابع كل طلب شخصيًا نيابةً عنك." },
];

// ── Local preview fallback (NOT real product data) ─────────────────────────
// Shown when fetchCategories()/fetchCompanies() fail AND (__DEV__ OR the API
// isn't configured) — so there's something on screen to judge the
// layout/polish against instead of a blank section, without a REAL
// customer's transient network blip in production ever rendering invented
// company names and ratings as if they were real. (It used to trigger on
// any failure, including a live production outage — this app's entire
// premise is that every listed company is manually vetted, so that was a
// trust problem independent of the banner below.) Kept scoped to this one
// screen rather than the shared lib/categories.ts, lib/companies.ts fetchers,
// so no other screen's "real vs. broken" signal gets masked by fake data —
// flagged with a visible banner below so it can never be mistaken for live
// data, and the cards themselves are non-interactive (see usingDemoData's
// use on each Pressable) since /company/demo-1 isn't a real route.
const DEMO_CATEGORIES = [
  { slug: "cleaning", label: "تنظيف", count: 34, cover: "https://placehold.co/400x320/0F62FE/FFFFFF?text=%D8%AA%D9%86%D8%B8%D9%8A%D9%81" },
  { slug: "moving", label: "نقل عفش", count: 21, cover: "https://placehold.co/400x320/198038/FFFFFF?text=%D9%86%D9%82%D9%84+%D8%B9%D9%81%D8%B4" },
  { slug: "ac", label: "تكييف وتبريد", count: 18, cover: "https://placehold.co/400x320/8A3FFC/FFFFFF?text=%D8%AA%D9%83%D9%8A%D9%8A%D9%81" },
  { slug: "plumbing", label: "سباكة", count: 27, cover: "https://placehold.co/400x320/DA1E28/FFFFFF?text=%D8%B3%D8%A8%D8%A7%D9%83%D8%A9" },
  { slug: "electrical", label: "كهرباء", count: 19, cover: "https://placehold.co/400x320/F1C21B/000000?text=%D9%83%D9%87%D8%B1%D8%A8%D8%A7%D8%A1" },
  { slug: "painting", label: "دهانات", count: 15, cover: "https://placehold.co/400x320/007D79/FFFFFF?text=%D8%AF%D9%87%D8%A7%D9%86%D8%A7%D8%AA" },
] as unknown as ApiCategory[];

const DEMO_COMPANIES = [
  {
    id: "demo-1", slug: "demo-1", name: "شركة النور للتنظيف",
    logo: "https://placehold.co/80x80/0F62FE/FFFFFF?text=%D9%86",
    cover: "https://placehold.co/500x320/0F62FE/FFFFFF?text=%D8%A7%D9%84%D9%86%D9%88%D8%B1",
    categoryLabel: "تنظيف", rating: 4.8, reviewCount: 126, completedProjects: 340,
    tagline: "خدمة تنظيف منازل وشركات باحترافية وسرعة في المواعيد.",
    verified: true, busy: false,
  },
  {
    id: "demo-2", slug: "demo-2", name: "الأمانة لنقل العفش",
    logo: "https://placehold.co/80x80/198038/FFFFFF?text=%D8%A7",
    cover: "https://placehold.co/500x320/198038/FFFFFF?text=%D8%A7%D9%84%D8%A3%D9%85%D8%A7%D9%86%D8%A9",
    categoryLabel: "نقل عفش", rating: 4.6, reviewCount: 89, completedProjects: 210,
    tagline: "نقل عفش آمن مع فك وتركيب وتغليف كامل لكل القطع.",
    verified: true, busy: true,
  },
  {
    id: "demo-3", slug: "demo-3", name: "المتحدة للتكييف",
    logo: "https://placehold.co/80x80/8A3FFC/FFFFFF?text=%D9%85",
    cover: "https://placehold.co/500x320/8A3FFC/FFFFFF?text=%D8%A7%D9%84%D9%85%D8%AA%D8%AD%D8%AF%D8%A9",
    categoryLabel: "تكييف وتبريد", rating: 4.7, reviewCount: 154, completedProjects: 402,
    tagline: "تركيب وصيانة تكييفات بكل الأنواع مع ضمان حقيقي.",
    verified: true, busy: false,
  },
  {
    id: "demo-4", slug: "demo-4", name: "الخبير للسباكة",
    logo: "https://placehold.co/80x80/DA1E28/FFFFFF?text=%D8%AE",
    cover: "https://placehold.co/500x320/DA1E28/FFFFFF?text=%D8%A7%D9%84%D8%AE%D8%A8%D9%8A%D8%B1",
    categoryLabel: "سباكة", rating: 4.5, reviewCount: 67, completedProjects: 180,
    tagline: "حل أعطال السباكة وتمديدات المياه بسرعة وضمان.",
    verified: false, busy: false,
  },
  {
    id: "demo-5", slug: "demo-5", name: "الطاقة للكهرباء",
    logo: "https://placehold.co/80x80/F1C21B/000000?text=%D8%B7",
    cover: "https://placehold.co/500x320/F1C21B/000000?text=%D8%A7%D9%84%D8%B7%D8%A7%D9%82%D8%A9",
    categoryLabel: "كهرباء", rating: 4.9, reviewCount: 203, completedProjects: 510,
    tagline: "أعمال كهرباء منزلية وتجارية بأعلى معايير السلامة.",
    verified: true, busy: false,
  },
  {
    id: "demo-6", slug: "demo-6", name: "الإبداع للدهانات",
    logo: "https://placehold.co/80x80/007D79/FFFFFF?text=%D8%A5",
    cover: "https://placehold.co/500x320/007D79/FFFFFF?text=%D8%A7%D9%84%D8%A5%D8%A8%D8%AF%D8%A7%D8%B9",
    categoryLabel: "دهانات", rating: 4.4, reviewCount: 51, completedProjects: 140,
    tagline: "دهانات داخلية وخارجية بألوان وتشطيبات عصرية.",
    verified: false, busy: false,
  },
] as unknown as ApiCompany[];

/**
 * The landing/discovery tab — the mobile counterpart of the website's
 * Home.tsx. Not a line-for-line port (that page is 720 lines with a
 * scroll-driven hero, a full-bleed cover, and marketing sections that only
 * make sense on a browser) — this keeps the same JOB: show what the product
 * is, surface top-rated companies, and get a customer into browsing fast.
 */
export default function Home() {
  const [categories, setCategories] = useState<ApiCategory[] | null>(null);
  const [featured, setFeatured] = useState<ApiCompany[] | null>(null);
  // Stat-counter inputs (task below) — a separate total/aggregate from
  // `featured`, which is capped to the first 6 for the carousel. Website
  // computes these from its full in-memory catalog (useCompanies()); mobile
  // has no such global cache, so this holds just enough (partner count, sum
  // of completed projects, average rating) from the same /companies response.
  const [stats, setStats] = useState({ partners: 0, projects: 0, avgRating10: 0 });
  const [projects, setProjects] = useState<FeaturedProject[]>([]);
  const [reviews, setReviews] = useState<ApiSiteReview[]>([]);
  const [reviewsEnabled, setReviewsEnabled] = useState(false);
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [usingDemoData, setUsingDemoData] = useState(false);
  const insets = useSafeAreaInsets();
  const settings = useSettings();
  const { height: windowHeight } = useWindowDimensions();
  const heroHeight = Math.min(
    HERO_MAX_HEIGHT,
    Math.max(HERO_MIN_HEIGHT, Math.round(windowHeight * HERO_HEIGHT_RATIO)),
  );

  const loadReviews = () => fetchSiteReviews().then(setReviews).catch(() => {});

  // Everything this screen reads from the server, in one callable unit — so
  // the mount effect below and useRefreshOnFocus run exactly the same work.
  // It used to be an inline mount effect, which meant the home screen showed
  // whatever the catalog looked like the first time the app was opened, for
  // the rest of the session (this tab is never unmounted).
  const loadAll = useCallback(() => {
    fetchCategories()
      .then(setCategories)
      .catch(() => {
        // Demo data is a DEV-ONLY preview aid (see the DEMO_CATEGORIES/
        // DEMO_COMPANIES comment) — it used to fall back for ANY failure,
        // including a real customer's transient network blip in production,
        // rendering invented company names and ratings as if they were real
        // in a product whose entire premise is that every listed company is
        // manually vetted. Gated on the same signal isApiConfigured() and
        // this app's other demo/offline branches already use.
        if (__DEV__ || !isApiConfigured()) {
          setCategories(DEMO_CATEGORIES);
          setUsingDemoData(true);
        } else {
          setCategories([]);
        }
      });
    // pageSize 100: comfortably covers the whole catalog in one request (the
    // website's own home page loads its full catalog into memory the same
    // way, via useCompanies()) so the stat counters below reflect every
    // active company, not just the 6 shown in the carousel.
    fetchCompanies(undefined, { pageSize: 100 })
      .then((page) => {
        setFeatured(page.data.slice(0, 6));
        const totalRating = page.data.reduce((s, c) => s + c.rating, 0);
        setStats({
          partners: page.meta.total,
          projects: page.data.reduce((s, c) => s + c.completedProjects, 0),
          avgRating10: page.data.length ? Math.round((totalRating / page.data.length) * 10) : 0,
        });
      })
      .catch(() => {
        if (__DEV__ || !isApiConfigured()) {
          setFeatured(DEMO_COMPANIES);
          setUsingDemoData(true);
        } else {
          setFeatured([]);
        }
      });
    fetchFeaturedProjects().then(setProjects).catch(() => {});
    fetchSiteReviewSettings().then((s) => setReviewsEnabled(s.enabled)).catch(() => {});
    loadReviews();
    // Branding/hero copy comes from the module-level settings cache, which is
    // otherwise fetched once per app session — see refreshSettings().
    void refreshSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useRefreshOnFocus(loadAll);

  function onScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    setScrolled(e.nativeEvent.contentOffset.y > SCROLL_SOLID_THRESHOLD);
  }

  const heroSource = settings.hero_image_url.trim() ? { uri: assetUri(settings.hero_image_url) } : DEFAULT_HERO;
  // Admin-editable hero copy, same override rule as the website's Home.tsx
  // (`heroTitleOverride || <default>`) — this screen only read hero_image_url
  // before, so changing the hero text from the dashboard had no effect here.
  const heroTitleOverride = settings.hero_title_ar.trim();
  const heroSubOverride = settings.hero_subtitle_ar.trim();

  return (
    <View style={styles.container}>
      {/* Floating transparent-over-hero bar (task 3) — a sibling AFTER the
          ScrollView in paint order, absolutely positioned over it, so it
          renders on top without needing an explicit elevation/zIndex fight.
          Transparent + white icons over the hero photo; solid + dark icons
          once scrolled past SCROLL_SOLID_THRESHOLD — same behavior and
          threshold as the website's TopNav on its full-bleed-hero routes. */}
      <ScrollView
        contentContainerStyle={styles.scroll}
        onScroll={onScroll}
        scrollEventThrottle={16}
      >
        <View style={[styles.heroWrap, { height: heroHeight }]}>
          <Image source={heroSource} style={styles.heroImage} contentFit="cover" />
          <View style={styles.heroScrim} />
          <View style={[styles.heroContent, { paddingTop: insets.top + 56 }]}>
            <Text style={styles.heroTitle}>
              {heroTitleOverride || <>كل خدمة موثوقة{"\n"}في العاصمة الجديدة</>}
            </Text>
            <Text style={styles.heroSub}>
              {/* No "بدون حساب" (guest checkout) claim — new-request/[slug].tsx
                  gates submitting a request behind an account
                  (useRequireAccount), unlike the website's RequestForm.tsx,
                  which lets a guest fill the form and only asks them to sign
                  in at submit. This copy used to promise the website's
                  behavior while the app enforces the stricter one — matches
                  the website's own home_hero_sub string now (i18n.ts), which
                  never carried that clause either. */}
              {heroSubOverride || "شركات موثّقة، جودة متميزة، وراحة بال كاملة."}
            </Text>
            {/* Primary CTA first, outline second — same DOM order as the
                website's `flex-col items-center sm:flex-row` button group,
                each ~85% width and stacked vertically at phone widths. */}
            <View style={styles.heroCtaRow}>
              <Pressable style={styles.heroCta} onPress={() => router.push("/services")}>
                <Text style={styles.heroCtaText}>استكشف الخدمات</Text>
              </Pressable>
              <Pressable style={styles.heroCtaOutline} onPress={() => router.push("/companies")}>
                <Text style={styles.heroCtaOutlineText}>تصفح الشركات</Text>
                {/* Points ONWARD, which in an Arabic UI is leftward — the
                    same thing the website draws as arrow_forward under its
                    rtl-flip. `arrow_back` is that glyph unmirrored, so it is
                    the name to use here, not the mirror of the back arrow. */}
                <Icon name="arrow_back" size={16} color="#fff" />
              </Pressable>
            </View>
            <View style={styles.heroScrollHint} pointerEvents="none">
              <Text style={styles.heroScrollHintText}>مرّر للأسفل</Text>
              <Icon name="expand_more" size={18} color="rgba(255,255,255,0.85)" />
            </View>
          </View>
        </View>

        {/* Same 4 counters as the website's Home.tsx STATS section, in the
            same position (right after the hero, before "why" reasons) —
            previously missing entirely from this screen. */}
        <View style={styles.statsRow}>
          <StatCounter target={stats.partners} label="شريك موثّق" />
          <StatCounter target={stats.projects} label="مشروع منجز" />
          <StatCounter
            target={stats.avgRating10}
            label="تقييم العملاء"
            displayFn={(n) => (n / 10).toFixed(1)}
            icon="star"
          />
          <StatCounter target={categories?.length ?? 0} label="فئة خدمات" />
        </View>

        <View style={styles.reasonsRow}>
          {REASONS.map((r) => (
            <View key={r.title} style={styles.reasonCard}>
              <Icon name={r.icon} size={22} color={colors.primary} />
              <Text style={styles.reasonTitle}>{r.title}</Text>
              <Text style={styles.reasonDesc}>{r.desc}</Text>
            </View>
          ))}
        </View>

        {usingDemoData && (
          <View style={styles.demoBanner}>
            <Icon name="info" size={16} color={colors.onWarningContainer} />
            <Text style={styles.demoBannerText}>
              بيانات تجريبية للمعاينة بس — السيرفر مش راجع بيانات حقيقية دلوقتي
            </Text>
          </View>
        )}

        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>تصفّح حسب الخدمة</Text>
          <Pressable onPress={() => router.push("/services")}>
            <Text style={styles.sectionLink}>الكل</Text>
          </Pressable>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryRow}>
          {(categories ?? []).map((c) => (
            <Pressable
              key={c.slug}
              style={styles.categoryCard}
              // Demo categories aren't real routes — usingDemoData only ever
              // true in __DEV__ or with no API configured (see the fetch
              // fallback above), but a demo card must still not navigate
              // anywhere real when it's shown.
              onPress={
                usingDemoData
                  ? undefined
                  : () => router.push({ pathname: "/services/[slug]", params: { slug: c.slug } })
              }
            >
              <Image source={{ uri: assetUri(c.cover) }} style={styles.categoryCardImage} contentFit="cover" />
              <LinearGradient
                colors={["transparent", "transparent", "rgba(0,0,0,0.82)"]}
                locations={[0, 0.5, 1]}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={styles.categoryCardScrim}
              />
              <View style={styles.categoryCardContent}>
                <View style={styles.categoryCardIconWrap}>
                  {/* The category's OWN glyph, same as the website's card —
                      this was pinned to the generic "category" icon, so all
                      six cards wore the same badge and it carried no
                      information at all. */}
                  <Icon name={toIconName(c.icon)} size={16} color="#fff" />
                </View>
                <Text style={styles.categoryCardTitle} numberOfLines={1}>{c.label}</Text>
                <Text style={styles.categoryCardCount}>{c.count} شركة</Text>
              </View>
            </Pressable>
          ))}
        </ScrollView>

        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>شركات مميزة</Text>
          <Pressable onPress={() => router.push("/companies")}>
            <Text style={styles.sectionLink}>الكل</Text>
          </Pressable>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.companyRow}>
          {(featured ?? []).map((item) => (
            <Pressable
              key={item.id}
              style={styles.companyCard}
              onPress={
                usingDemoData
                  ? undefined
                  : () => router.push({ pathname: "/company/[slug]", params: { slug: item.slug } })
              }
            >
              <View style={styles.companyCardCoverWrap}>
                <Image source={{ uri: firstAssetUri(item.cover, item.logo) }} style={styles.companyCardCoverImage} contentFit="cover" />
                <LinearGradient
                  colors={["transparent", "rgba(0,0,0,0.55)"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 0, y: 1 }}
                  style={styles.companyCardScrim}
                />
                {/* Logo badge — top-right, matching the website's RTL-resolved
                    position (`rtl:right-4`, since Arabic is the default
                    locale here). */}
                <View style={styles.companyCardLogo}>
                  <Image source={{ uri: assetUri(item.logo) }} style={styles.companyCardLogoImg} contentFit="cover" />
                </View>
                {item.verified ? (
                  <View style={styles.companyCardVerified}>
                    <Icon name="verified" size={12} color={colors.primary} />
                    <Text style={styles.companyCardVerifiedText}>موثّقة</Text>
                  </View>
                ) : null}
                {item.busy ? (
                  <View style={styles.companyCardBusy}>
                    <Icon name="event_busy" size={12} color="#fff" />
                    <Text style={styles.companyCardBusyText}>مشغولة</Text>
                  </View>
                ) : null}
              </View>
              <View style={styles.companyCardBody}>
                <Text style={styles.companyCardName} numberOfLines={1}>{item.name}</Text>
                <Text style={styles.companyCardCategory} numberOfLines={1}>{item.categoryLabel}</Text>
                <View style={styles.companyCardRatingRow}>
                  <Text style={styles.ratingStar}>★</Text>
                  <Text style={styles.ratingText}>{item.rating.toFixed(1)}</Text>
                  <Text style={styles.companyCardReviewCount}>({item.reviewCount})</Text>
                </View>
                {item.tagline ? (
                  <Text style={styles.companyCardTagline} numberOfLines={2}>{item.tagline}</Text>
                ) : null}
                <View style={styles.companyCardFooter}>
                  <Text style={styles.companyCardProjects}>{item.completedProjects} مشروع</Text>
                  <View style={styles.companyCardView}>
                    <Text style={styles.companyCardViewText}>عرض</Text>
                    <Icon name="arrow_back" size={12} color={colors.primary} />
                  </View>
                </View>
              </View>
            </Pressable>
          ))}
        </ScrollView>

        {projects.length > 0 && (
          <>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>مشاريع مميزة</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.projectRow}>
              {projects.map((p, i) => (
                <View key={`${p.title}-${i}`} style={styles.projectCard}>
                  <Image source={{ uri: assetUri(p.img) }} style={styles.projectImage} />
                  <View style={styles.projectOverlay}>
                    <Text style={styles.projectCategory}>{p.category}</Text>
                    <Text style={styles.projectTitle} numberOfLines={1}>{p.title}</Text>
                    <Text style={styles.projectCompany} numberOfLines={1}>{p.company}</Text>
                  </View>
                </View>
              ))}
            </ScrollView>
          </>
        )}

        {/* Testimonials sit on their own tinted band, the way the website
            separates this section with a rule and a background of its own —
            and here that flat band colour is also what the marquee's edge
            fades resolve into (see ReviewsMarquee's BAND). */}
        <View style={styles.reviewsBand}>
          <View style={styles.sectionHead}>
            <View style={styles.reviewsHeadText}>
              <View style={styles.reviewsTitleRow}>
                <Text style={styles.sectionTitle}>آراء العملاء</Text>
                {/* A quick trust signal — the average score and volume behind
                    the strip below, so a visitor doesn't have to scroll the
                    marquee just to gauge it. Derived from the same `reviews`
                    the marquee itself renders, never a hardcoded number. */}
                {reviews.length > 0 && (
                  <View style={styles.ratingBadge}>
                    <Icon name="star" size={12} color={colors.warning} />
                    <Text style={styles.ratingBadgeText}>
                      {(reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1)}
                    </Text>
                  </View>
                )}
              </View>
              {/* Same sub-line the website's SectionHeader carries here
                  (i18n home_reviews_sub) — the strip below is testimonials
                  from real customers, which is the whole point of it. */}
              <Text style={styles.reviewsSub}>تجارب حقيقية من سكان وأعمال العاصمة الإدارية.</Text>
            </View>
            {/* A filled pill, not a bare text link like the other section
                heads: this is the one action on this screen a signed-out
                visitor can take without a lead form, and the website styles
                it as a primary button (bg-primary + rate_review icon) too. */}
            <Pressable
              onPress={() => reviewsEnabled && setReviewModalOpen(true)}
              disabled={!reviewsEnabled}
              accessibilityRole="button"
              accessibilityState={{ disabled: !reviewsEnabled }}
              style={({ pressed }) => [styles.reviewsShareWrap, pressed && reviewsEnabled && styles.reviewsSharePressed]}
            >
              {reviewsEnabled ? (
                <LinearGradient
                  colors={[colors.primary, colors.primaryContainer]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.reviewsShare}
                >
                  <Icon name="rate_review" size={15} color={colors.onPrimary} />
                  <Text style={styles.reviewsShareText}>شارك رأيك</Text>
                </LinearGradient>
              ) : (
                <View style={[styles.reviewsShare, styles.reviewsShareDisabled]}>
                  <Icon name="rate_review" size={15} color={colors.outline} />
                  <Text style={[styles.reviewsShareText, styles.reviewsShareTextDisabled]}>شارك رأيك</Text>
                </View>
              )}
            </Pressable>
          </View>
          {reviews.length > 0 ? (
            <ReviewsMarquee reviews={reviews} />
          ) : (
            <Text style={styles.noReviews}>لسه مفيش آراء منشورة.</Text>
          )}
        </View>

        <GuidedCard />
      </ScrollView>

      <View style={[styles.topBar, { paddingTop: insets.top + 8 }, scrolled && styles.topBarSolid]}>
        {/* Absolutely centered, independent of the search button — matches
            the website's TopNav, where the logo is `absolute left-1/2
            -translate-x-1/2` rather than one flex child pushed around by
            justify-content. With only one other icon in this bar, the old
            row-reverse + space-between layout left the logo pinned to a
            side instead of dead-center. */}
        <View style={[styles.topBarLogoWrap, { top: insets.top }]} pointerEvents="none">
          <Logo size={30} />
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="بحث" onPress={() => router.push("/search")} hitSlop={8}>
          <Icon name="search" size={22} color={scrolled ? colors.onSurface : "#fff"} />
        </Pressable>
      </View>

      <SiteReviewModal
        visible={reviewModalOpen}
        onClose={() => setReviewModalOpen(false)}
        onSubmitted={() => {
          setReviewModalOpen(false);
          loadReviews();
        }}
      />
    </View>
  );
}

// ── Animated stat counter ─────────────────────────────────────────────────
// Mobile counterpart of the website's own StatCounter in Home.tsx — same
// idea (count up from 0 via useCountUp), simplified to what RN needs.
function StatCounter({
  target,
  label,
  displayFn,
  icon,
}: {
  target: number;
  label: string;
  displayFn?: (n: number) => string;
  icon?: "star";
}) {
  const count = useCountUp(target);
  const display = displayFn ? displayFn(count) : String(count);
  return (
    <View style={styles.statItem}>
      <View style={styles.statValueRow}>
        <Text style={styles.statValue}>{display}</Text>
        {icon && <Icon name={icon} size={18} color={colors.primary} />}
      </View>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

// ── Guided-start recommendation CTA ─────────────────────────────────────────
// A smart-recommendation card, not a generic notification: a compact circular
// badge (not the old 44×44 solid square, which read as heavier than the two
// lines of text beside it), a tightened title/subtitle pair, and a real press
// state — a scale spring driven imperatively so it stays smooth on the JS
// thread's own timer rather than snapping instantly the way a plain
// `pressed && style` swap does elsewhere in this file.
function GuidedCard() {
  const scale = useRef(new Animated.Value(1)).current;

  function onPressIn() {
    Animated.spring(scale, { toValue: 0.98, useNativeDriver: true, speed: 40, bounciness: 0 }).start();
  }
  function onPressOut() {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 40, bounciness: 0 }).start();
  }

  return (
    <Pressable
      onPress={() => router.push("/guided-start")}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      style={({ pressed }) => [styles.guidedTouchable, pressed && styles.guidedTouchablePressed]}
    >
      <Animated.View style={[styles.guidedCard, { transform: [{ scale }] }]}>
        <View style={styles.guidedIcon}>
          <Icon name="check_circle" size={18} color={colors.primary} />
        </View>
        <View style={styles.guidedText}>
          <Text style={styles.guidedTitle} numberOfLines={1}>مش عارف تختار مين؟</Text>
          <Text style={styles.guidedDesc} numberOfLines={1}>جاوب على سؤالين ونرشّحلك أفضل شركة</Text>
        </View>
        <Icon name="chevron_left" size={18} color={colors.outline} />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  // Floats over the ScrollView (see the JSX comment) rather than taking its
  // own space above it — that's what lets the hero image start at the true
  // top of the screen, behind a transparent bar, matching the website's
  // `position:fixed` nav over its full-bleed hero.
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    minHeight: 46,
    flexDirection: rowStart,
    justifyContent: "flex-start",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 8,
    backgroundColor: "transparent",
  },
  topBarSolid: {
    backgroundColor: colors.surfaceContainerLowest,
    borderBottomWidth: 1,
    borderBottomColor: colors.outlineVariant,
  },
  // Stretches to the topBar's own height so the logo centers on both axes,
  // and spans full width so `alignItems: "center"` centers it horizontally
  // regardless of where the search button sits.
  //
  // `top` is NOT set here — an absolutely positioned child measures `top: 0`
  // from the PARENT's padding box, which ignores topBar's own dynamic
  // `paddingTop: insets.top + 8` entirely. The search icon is a normal-flow
  // sibling, so it correctly lands below the notch; this box, statically
  // pinned to the literal top edge, centered the logo starting from UNDER
  // the notch — visibly higher than the search icon beside it. Set inline
  // (see the JSX) to the same `insets.top` the parent's padding uses.
  topBarLogoWrap: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  scroll: { paddingBottom: 32 },
  // height is set dynamically per-window (see heroHeight) — this just
  // provides the clipping/background base.
  heroWrap: { overflow: "hidden", backgroundColor: colors.primary },
  // absoluteFillObject alone (top/left/right/bottom:0, no explicit
  // width/height) let RNW size this DIV by the source image's own intrinsic
  // pixel dimensions instead of stretching it to the hero box — harmless for
  // the old landscape asset (close enough to the box's aspect that it went
  // unnoticed) but broke completely for the new tall portrait photo, which
  // rendered at its native 853×1844 instead of filling the box. Explicit
  // 100%/100% forces it to always fill the parent regardless of the source
  // image's own size.
  heroImage: { ...StyleSheet.absoluteFillObject, width: "100%", height: "100%" },
  heroScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.4)" },
  // Centered on both axes — matches the website's `flex items-center
  // justify-center` header with `text-center` content, not the old
  // bottom-anchored/right-aligned layout.
  heroContent: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24, gap: 10 },
  heroTitle: {
    fontSize: type.headline.fontSize,
    fontFamily: "Alexandria_800ExtraBold",
    color: "#fff",
    textAlign: "center",
    lineHeight: 34,
    maxWidth: 320,
    textShadowColor: "rgba(0,0,0,0.35)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  heroSub: {
    fontSize: type.body.fontSize,
    fontFamily: "Cairo_400Regular",
    color: "#fff",
    opacity: 0.92,
    textAlign: "center",
    maxWidth: 300,
    textShadowColor: "rgba(0,0,0,0.35)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  // Stacked vertically, each button ~85% width — matches the website's
  // `flex-col items-center sm:flex-row` + `w-[85%] sm:w-auto` at phone
  // widths, instead of the old side-by-side row.
  heroCtaRow: { flexDirection: "column", alignItems: "center", width: "100%", gap: 10, marginTop: 14 },
  // Secondary/ghost pill — "تصفح الشركات".
  heroCtaOutline: {
    width: "85%",
    flexDirection: rowStart,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.16)",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
  },
  heroCtaOutlineText: { fontFamily: "Cairo_700Bold", fontSize: type.label.fontSize, color: "#fff" },
  // Primary/solid pill — "استكشف الخدمات". DOM-first, matching the website.
  heroCta: {
    width: "85%",
    flexDirection: rowStart,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 999,
  },
  heroCtaText: { fontFamily: "Cairo_700Bold", fontSize: type.label.fontSize, color: "#fff" },
  heroScrollHint: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 2, alignSelf: "center", marginTop: 16 },
  heroScrollHintText: { fontFamily: "Cairo_600SemiBold", fontSize: 11, color: "rgba(255,255,255,0.85)" },
  statsRow: {
    flexDirection: rowStart,
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: 20,
    marginHorizontal: 20,
    marginTop: -24,
    paddingVertical: 20,
    paddingHorizontal: 8,
    // Pulls the stats card up over the hero's bottom edge, matching the
    // website's `-mt-6 rounded-t-3xl` treatment on its own stats section.
    zIndex: 2,
  },
  statItem: { flex: 1, alignItems: "center", gap: 4 },
  statValueRow: { flexDirection: rowStart, alignItems: "center", gap: 4 },
  statValue: { fontFamily: "Alexandria_800ExtraBold", fontSize: 22, color: colors.primary },
  statLabel: { fontFamily: "Cairo_700Bold", fontSize: 10, color: colors.outline, textAlign: "center" },
  // 2×2 grid, not a 4-across row (website's own mobile breakpoint is
  // grid-cols-1 for this same section) — 4 cards squeezed into one row left
  // almost no room for the description text to breathe.
  reasonsRow: { flexDirection: rowStart, flexWrap: "wrap", gap: 10, padding: 20 },
  reasonCard: { width: "47%", backgroundColor: colors.surfaceContainerLowest, borderRadius: 14, padding: 12, gap: 4, borderWidth: 1, borderColor: colors.outlineVariant },
  reasonTitle: { fontFamily: "Cairo_700Bold", fontSize: type.caption.fontSize, color: colors.onSurface, textAlign: "right" },
  reasonDesc: { fontFamily: "Cairo_400Regular", fontSize: 10, color: colors.outline, textAlign: "right" },
  demoBanner: {
    flexDirection: rowStart,
    alignItems: "center",
    gap: 8,
    marginHorizontal: 20,
    marginBottom: 4,
    backgroundColor: colors.warningContainer,
    borderRadius: 12,
    padding: 10,
  },
  demoBannerText: {
    flex: 1,
    fontFamily: "Cairo_600SemiBold",
    fontSize: 11,
    color: colors.onWarningContainer,
    textAlign: "right",
  },
  sectionHead: { flexDirection: rowStart, justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, marginTop: 8, marginBottom: 10 },
  sectionTitle: { fontFamily: "Cairo_700Bold", fontSize: type.subhead.fontSize, color: colors.onSurface },
  sectionLink: { fontFamily: "Cairo_600SemiBold", fontSize: type.label.fontSize, color: colors.primary },
  categoryRow: { flexDirection: rowStart, paddingHorizontal: 20 },
  // Photo-first card — matches the website's `<Link>` card (full-bleed
  // `cover` image, bottom scrim, glass icon badge, label+count overlaid)
  // instead of the old generic icon+label+count chip.
  categoryCard: { width: 210, height: 176, borderRadius: 18, overflow: "hidden", marginStart: 10, backgroundColor: colors.surfaceContainer },
  categoryCardImage: { ...StyleSheet.absoluteFillObject, width: "100%", height: "100%" },
  categoryCardScrim: { ...StyleSheet.absoluteFillObject },
  categoryCardContent: { position: "absolute", left: 0, right: 0, bottom: 0, padding: 14, gap: 6 },
  categoryCardIconWrap: {
    alignSelf: "flex-end",
    backgroundColor: "rgba(255,255,255,0.18)",
    borderRadius: 999,
    padding: 6,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
  },
  categoryCardTitle: {
    fontFamily: "Cairo_700Bold",
    fontSize: type.subhead.fontSize,
    color: "#fff",
    textAlign: "right",
    textShadowColor: "rgba(0,0,0,0.35)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  categoryCardCount: { fontFamily: "Cairo_600SemiBold", fontSize: type.caption.fontSize, color: "rgba(255,255,255,0.85)", textAlign: "right" },
  companyRow: { flexDirection: rowStart, paddingHorizontal: 20 },
  // Photo-first card — cover image + logo badge + verified/busy badges,
  // matching the website's Companies card instead of the old small-logo row.
  companyCard: { width: 250, borderRadius: 18, overflow: "hidden", marginStart: 12, backgroundColor: colors.surfaceContainerLowest, borderWidth: 1, borderColor: colors.outlineVariant },
  companyCardCoverWrap: { height: 140, backgroundColor: colors.surfaceContainer },
  companyCardCoverImage: { ...StyleSheet.absoluteFillObject, width: "100%", height: "100%" },
  companyCardScrim: { ...StyleSheet.absoluteFillObject },
  // Logo — top-right (see the JSX comment for why "right", not "left").
  companyCardLogo: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#fff",
    backgroundColor: "#fff",
    overflow: "hidden",
  },
  companyCardLogoImg: { width: "100%", height: "100%" },
  // Verified badge — top-left in RTL (website: `rtl:right-auto rtl:left-2.5`).
  companyCardVerified: {
    position: "absolute",
    top: 8,
    left: 8,
    flexDirection: rowStart,
    alignItems: "center",
    gap: 3,
    backgroundColor: "rgba(255,255,255,0.92)",
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  companyCardVerifiedText: { fontFamily: "Cairo_700Bold", fontSize: 10, color: colors.primary },
  // Busy badge — bottom-right in RTL (website: `rtl:left-auto rtl:right-2.5`).
  companyCardBusy: {
    position: "absolute",
    bottom: 8,
    right: 8,
    flexDirection: rowStart,
    alignItems: "center",
    gap: 3,
    backgroundColor: "#f59e0b",
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  companyCardBusyText: { fontFamily: "Cairo_700Bold", fontSize: 10, color: "#fff" },
  companyCardBody: { padding: 12, gap: 3 },
  companyCardName: { fontFamily: "Cairo_700Bold", fontSize: type.label.fontSize, color: colors.onSurface, textAlign: "right" },
  companyCardCategory: { fontFamily: "Cairo_600SemiBold", fontSize: 11, color: colors.outline, textAlign: "right" },
  companyCardRatingRow: { flexDirection: rowStart, alignItems: "center", gap: 4, marginTop: 2 },
  companyCardReviewCount: { fontFamily: "Cairo_400Regular", fontSize: 11, color: colors.outline },
  companyCardTagline: { fontFamily: "Cairo_400Regular", fontSize: 11, color: colors.onSurfaceVariant, textAlign: "right", marginTop: 4, lineHeight: 16 },
  companyCardFooter: { flexDirection: rowStart, justifyContent: "space-between", alignItems: "center", marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.outlineVariant },
  companyCardProjects: { fontFamily: "Cairo_400Regular", fontSize: 11, color: colors.outline },
  companyCardView: { flexDirection: rowStart, alignItems: "center", gap: 3 },
  companyCardViewText: { fontFamily: "Cairo_700Bold", fontSize: 11, color: colors.primary },
  ratingText: { fontFamily: "Cairo_700Bold", fontSize: type.caption.fontSize, color: colors.onSurface },
  ratingStar: { color: "#f59e0b", fontSize: type.caption.fontSize },
  projectRow: { flexDirection: rowStart, paddingHorizontal: 20 },
  projectCard: { width: 220, height: 140, borderRadius: 14, overflow: "hidden", marginStart: 10, backgroundColor: colors.surfaceContainer },
  projectImage: { width: "100%", height: "100%" },
  projectOverlay: { position: "absolute", bottom: 0, left: 0, right: 0, padding: 10, backgroundColor: "rgba(0,0,0,0.45)" },
  projectCategory: { fontFamily: "Cairo_700Bold", fontSize: 10, color: colors.onPrimary, marginBottom: 2, alignSelf: "flex-end" },
  projectTitle: { fontFamily: "Cairo_700Bold", fontSize: type.label.fontSize, color: "#fff", textAlign: "right" },
  projectCompany: { fontFamily: "Cairo_400Regular", fontSize: type.caption.fontSize, color: "rgba(255,255,255,0.8)", textAlign: "right" },
  // The band the whole testimonials section sits on. ReviewsMarquee's edge
  // fades are gradients of this exact colour, so it has to stay flat — a
  // gradient band here would leave the fades visible as pale rectangles.
  reviewsBand: {
    marginTop: 20,
    paddingTop: 18,
    paddingBottom: 20,
    backgroundColor: colors.surfaceContainerLow,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "rgba(191, 199, 207, 0.45)",
  },
  reviewsHeadText: { flexShrink: 1, gap: 2 },
  reviewsTitleRow: { flexDirection: rowStart, alignItems: "center", gap: 8 },
  ratingBadge: {
    flexDirection: rowStart,
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "rgba(245, 158, 11, 0.12)",
  },
  ratingBadgeText: { fontFamily: "Cairo_700Bold", fontSize: 11, color: "#92650a" },
  reviewsSub: { fontFamily: "Cairo_400Regular", fontSize: 11, color: colors.outline, textAlign: "right" },
  reviewsShareWrap: { borderRadius: 999, overflow: "hidden" },
  reviewsShare: {
    flexDirection: rowStart,
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    shadowColor: "#0b2b3d",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 2,
  },
  reviewsSharePressed: { opacity: 0.85 },
  reviewsShareDisabled: { backgroundColor: colors.surfaceContainerHigh, shadowOpacity: 0 },
  reviewsShareText: { fontFamily: "Cairo_700Bold", fontSize: type.caption.fontSize, color: colors.onPrimary },
  reviewsShareTextDisabled: { color: colors.outline },
  noReviews: { fontFamily: "Cairo_400Regular", fontSize: type.label.fontSize, color: colors.outline, textAlign: "center", paddingVertical: 12 },
  // Outer Pressable: only carries layout + the instant (non-animated) pressed
  // tint, so it never fights the inner Animated.View's own transform.
  guidedTouchable: { marginHorizontal: 20, marginTop: 24, borderRadius: 20 },
  guidedTouchablePressed: { opacity: 0.97 },
  guidedCard: {
    flexDirection: rowStart,
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: 20,
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderWidth: 1,
    // A softer line than the flat outlineVariant token every other card on
    // this screen uses — this card reads as a recommendation, not a list row,
    // so it earns a lighter edge to go with the icon-circle and shadow below.
    borderColor: "rgba(191, 199, 207, 0.55)",
    // First shadow in this screen's stylesheet — every other card here relies
    // on a flat border alone. Kept deliberately faint (0.05 opacity, no large
    // spread): enough to lift the card off the page, not enough to read as a
    // notification/toast.
    shadowColor: "#0b2b3d",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  // Circular, compact (36px) — the old 44×44 solid-square badge was heavier
  // than the two lines of text it sat beside. `primary` at 10% opacity (same
  // ratio the website's own icon-circles use — home_why cards, bg-primary/10)
  // reads as a soft recommendation tint instead of a saturated block.
  guidedIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0, 85, 120, 0.10)",
    alignItems: "center",
    justifyContent: "center",
  },
  guidedText: { flex: 1, gap: 2 },
  guidedTitle: {
    fontFamily: "Cairo_700Bold",
    fontSize: type.body.fontSize,
    lineHeight: type.body.lineHeight,
    letterSpacing: -0.1,
    color: colors.onSurface,
    textAlign: "right",
  },
  guidedDesc: {
    fontFamily: "Cairo_400Regular",
    fontSize: type.caption.fontSize,
    lineHeight: type.caption.lineHeight,
    color: colors.outline,
    textAlign: "right",
  },
});
