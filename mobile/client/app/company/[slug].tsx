import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { router, useLocalSearchParams } from "expo-router";
import type { ApiCompany } from "@alassema/core";
import { colors, type } from "@alassema/core";
import Icon from "../../components/Icon";
import Logo from "../../components/Logo";
import FeedbackModal from "../../components/FeedbackModal";
import MenuModal from "../../components/MenuModal";
import AvailabilityBadge from "../../components/AvailabilityBadge";
import CompanyGallery from "../../components/CompanyGallery";
import OfferingGroup from "../../components/OfferingGroup";
import { fetchCompany } from "../../lib/companyDetail";
import { useRefreshOnFocus, ApiError, assetUri, firstAssetUri, rowStart } from "@alassema/mobile-shared";
import { useIsSaved } from "../../lib/saved";
import { formatPrice } from "../../lib/pricing";
import { splitByKind } from "../../lib/offerings";
import { availableAgainAt, formatReopenDate } from "../../lib/availability";
import { useCustomerAuth } from "../../lib/customerAuth";
import { requireAccount } from "../../lib/authGate";

const SCROLL_SOLID_THRESHOLD = 60;
const HEADER_H = 46;
const TABS_H = 44;

const TABS = [
  { key: "about", label: "نظرة عامة" },
  { key: "gallery", label: "المعرض" },
  { key: "projects", label: "المشاريع" },
];

/**
 * The company profile — the mobile counterpart of the website's
 * CompanyProfile.tsx, rebuilt for full content/structural parity (identity
 * block, availability, credentials, priced services/products, gallery,
 * projects, contact, final CTA) rather than the earlier simplified version.
 *
 * "أضف للطلب" on a service/product card, and the primary CTA when the
 * company is QUOTE_ONLY (or busy), navigate into new-request/[slug] — that
 * screen's OfferingPicker already IS this app's multi-item basket UI (see
 * its own comment); duplicating basket STATE here would just create a
 * second source of truth for the same selection. When the company runs a
 * FIXED_CATALOG (like the reference screenshots' company), the primary CTA
 * instead scrolls to the services section — exactly mirroring the website's
 * PricingCTA component, not a mobile-specific shortcut.
 *
 * Section nav: scroll-to (stickyHeaderIndices pins the tab row once you
 * reach it) rather than the website's SectionNav swapping mounted content —
 * this is one long ScrollView, so a tap just needs to land on the right
 * offset. `body`'s onLayout gives that View's y within the ScrollView's
 * content; each section's own onLayout gives its y within `body`. Summed,
 * that's the section's true scroll offset.
 */
export default function CompanyProfile() {
  const { slug, offering: offeringParam } = useLocalSearchParams<{ slug: string; offering?: string }>();
  const { customer } = useCustomerAuth();
  const insets = useSafeAreaInsets();
  const [company, setCompany] = useState<ApiCompany | null>(null);
  const [error, setError] = useState("");
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [openProject, setOpenProject] = useState<number | null>(0);
  const [scrolled, setScrolled] = useState(false);
  const [activeTab, setActiveTab] = useState("about");
  const { saved, toggle } = useIsSaved(slug);
  const next = `/company/${slug}`;

  const scrollRef = useRef<ScrollView>(null);
  const bodyY = useRef(0);
  const sectionY = useRef<Record<string, number>>({});

  function scrollToSection(key: string) {
    const y = bodyY.current + (sectionY.current[key] ?? 0);
    scrollRef.current?.scrollTo({ y: Math.max(0, y - (TABS_H + 8)), animated: true });
  }

  const load = useCallback(
    (isRefresh = false) => {
      fetchCompany(slug)
        .then((c) => {
          setCompany(c);
          setError("");
        })
        .catch((err) => {
          // A failed BACKGROUND refresh must not replace a profile that is
          // already on screen with the full-screen error state below — the
          // customer would lose a page they were reading over one bad
          // request. The mount load still reports, because there is nothing
          // to lose there.
          if (isRefresh) return;
          setError(err instanceof ApiError ? err.message : "تعذّر تحميل بيانات الشركة.");
        });
    },
    [slug],
  );

  useEffect(() => {
    load();
  }, [load]);

  // This screen holds the data most likely to have been edited on the website
  // while a customer is looking at it — prices, offerings, availability,
  // reviews. It also stays mounted underneath whatever is pushed on top of it
  // (the request form, the waitlist, an offering), so returning from one used
  // to show the numbers as they were when the profile was first opened.
  useRefreshOnFocus(() => load(true));

  // A search result for a product/service (Offering) links here with
  // `?offering=<id>` so the visitor lands on the priced cards, not just the
  // top of the profile — same scrollToSection the "اختر الخدمات" button uses.
  //
  // Fires ONCE per arrival, not on every change to `company`: the profile is
  // refetched when this screen comes back into view (see load above), and
  // without this guard returning from the request form would yank the
  // customer back down to the services section as if they had just followed
  // the deep link again.
  const offeringScrolled = useRef(false);
  useEffect(() => {
    if (!company || !offeringParam || offeringScrolled.current) return;
    offeringScrolled.current = true;
    const id = requestAnimationFrame(() => scrollToSection("services"));
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company, offeringParam]);

  function onScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const y = e.nativeEvent.contentOffset.y;
    setScrolled(y > SCROLL_SOLID_THRESHOLD);
    const probe = y + HEADER_H + TABS_H + 16;
    let current = TABS[0].key;
    for (const tab of TABS) {
      const secY = bodyY.current + (sectionY.current[tab.key] ?? 0);
      if (secY <= probe) current = tab.key;
    }
    setActiveTab(current);
  }

  if (error) {
    return (
      <View style={styles.container}>
        <View style={styles.centerFill}>
          <Icon name="business_center" size={40} color={colors.outline} />
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={() => router.back()}>
            <Text style={styles.backLink}>رجوع</Text>
          </Pressable>
        </View>
      </View>
    );
  }
  if (!company) {
    return (
      <View style={styles.container}>
        <View style={styles.centerFill}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      </View>
    );
  }

  const isBusy = company.busy;
  const backAt = availableAgainAt(company);
  const requestParams = { slug: company.slug, name: company.name };
  const { services, products } = splitByKind(company.offerings ?? []);
  const hasCatalog = services.length > 0 || products.length > 0;
  const fixedCatalog = company.categoryPricingMode === "FIXED_CATALOG";

  function goRequest(offeringId?: string) {
    requireAccount(
      customer,
      () =>
        router.push({
          pathname: "/new-request/[slug]",
          params: offeringId ? { ...requestParams, offeringId } : requestParams,
        }),
      {
        title: "سجل الدخول لإكمال طلبك",
        subtitle: "تحتاج إلى تسجيل الدخول عشان نقدر نتابع طلبك ونتواصل معك.",
        next,
        secondary: { label: "إنشاء حساب", kind: "register" },
      },
    );
  }

  // Mirrors the website's PricingCTA exactly: FIXED_CATALOG scrolls to the
  // services section (no login needed — it's still just browsing), anything
  // else navigates straight into the request form (login required there).
  //
  // A busy company goes to that SAME request form, which queues the finished
  // request on their waiting list instead of sending it (see new-request). It
  // used to go to a separate screen that asked only for a name and a phone
  // number — so being busy cost the customer the order they came to place, not
  // just the wait. It skips the catalog detour: at a busy company the point is
  // to get the whole request in and hold a place, and the picker is on the form.
  function onPrimaryPress() {
    if (isBusy) return goRequest();
    if (fixedCatalog && hasCatalog) return scrollToSection("services");
    goRequest();
  }
  const primaryLabel = isBusy ? "اطلب واحجز دورك" : fixedCatalog && hasCatalog ? "اختر الخدمات" : "اطلب خدمة";

  function onFavoritePress() {
    requireAccount(customer, toggle, {
      title: "سجل الدخول لحفظ المفضلة",
      subtitle: "سجل الدخول عشان تقدر تحفظ الشركات والخدمات المفضلة عندك.",
      next,
      secondary: { label: "ليس الآن", kind: "dismiss" },
    });
  }

  return (
    <View style={styles.container}>
      <StatusBar style={scrolled ? "dark" : "light"} />

      <ScrollView
        ref={scrollRef}
        onScroll={onScroll}
        scrollEventThrottle={16}
        stickyHeaderIndices={[1]}
        contentContainerStyle={{ paddingBottom: 96 + insets.bottom }}
      >
        {/* index 0 — cover + back pill + identity block */}
        <View>
          <View style={styles.coverWrap}>
            <Image source={{ uri: firstAssetUri(company.cover, company.logo) }} style={styles.cover} />
            <LinearGradient colors={["rgba(4,12,26,0.35)", "rgba(4,12,26,0)"]} style={styles.coverScrim} pointerEvents="none" />
            <Pressable
              style={[styles.backPill, { top: insets.top + HEADER_H + 4 }]}
              onPress={() => router.back()}
              accessibilityRole="button"
              accessibilityLabel="رجوع"
            >
              <Text style={styles.backPillText}>رجوع</Text>
              {/* Mirrored: MaterialIcons' arrow-back glyph is a fixed shape
                  pointing left — RTL layout direction doesn't flip icon
                  fonts on its own, so "back" (toward where you came from, in
                  RTL reading direction) has to be flipped explicitly to
                  actually point right, matching the reference screenshots. */}
              <Icon name="arrow_forward" size={16} color="#fff" />
            </Pressable>
          </View>

          <View style={styles.identity}>
            <View style={styles.logoRow}>
              <Image source={{ uri: assetUri(company.logo) }} style={styles.logo} />
              <View style={styles.identityText}>
                <View style={styles.nameRow}>
                  <Text style={styles.name}>{company.name}</Text>
                  {company.verified && (
                    <View style={styles.verifiedBadge}>
                      <Icon name="verified" size={13} color={colors.primary} />
                      <Text style={styles.verifiedText}>موثّقة</Text>
                    </View>
                  )}
                </View>
                <AvailabilityBadge company={company} />
              </View>
            </View>

            <Text style={styles.category}>{company.categoryLabel}</Text>

            <View style={styles.statsRow}>
              <Text style={styles.ratingStars}>{"★".repeat(Math.round(company.rating))}</Text>
              <Text style={styles.ratingValue}>{company.rating.toFixed(1)}</Text>
              <Text style={styles.statMuted}>({company.reviewCount} تقييم)</Text>
              <Text style={styles.statDot}>·</Text>
              <Text style={styles.statMuted}>{company.completedProjects} مشروع منجز</Text>
            </View>

            <View style={styles.trustRow}>
              <View style={styles.trustPill}>
                <Icon name="workspace_premium" size={13} color={colors.onSurfaceVariant} />
                <Text style={styles.trustPillText}>{company.yearsExperience} سنوات خبرة</Text>
              </View>
              <View style={[styles.trustPill, styles.trustPillGreen]}>
                <Icon name="bolt" size={13} color="#15803d" />
                <Text style={[styles.trustPillText, styles.trustPillGreenText]}>يرد {company.responseTime}</Text>
              </View>
              <View style={styles.trustPill}>
                <Icon name="verified_user" size={13} color={colors.onSurfaceVariant} />
                <Text style={styles.trustPillText}>موثّقة منذ {company.verifiedSince}</Text>
              </View>
            </View>

            {isBusy && (
              <View style={styles.busyBanner}>
                <Icon name="event_busy" size={18} color={colors.onWarningContainer} />
                <View style={styles.busyTextWrap}>
                  <Text style={styles.busyTitle}>
                    {backAt ? `الحجز مكتمل حتى ${formatReopenDate(backAt)}` : "الشركة مشغولة بالكامل حاليًا"}
                  </Text>
                  <Text style={styles.busyText}>{company.busyNote || "اطلب عادي — طلبك بيتسجّل كامل وبياخد دوره، وهيبدأوا معاك أول ما يفضوا."}</Text>
                </View>
              </View>
            )}

            <View style={styles.actionsRow}>
              <Pressable
                style={({ pressed }) => [styles.primaryAction, pressed && styles.pressed]}
                onPress={onPrimaryPress}
              >
                <Icon name={isBusy ? "hourglass_top" : "send"} size={17} color={colors.onPrimary} />
                <Text style={styles.primaryActionText}>{primaryLabel}</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.saveAction, pressed && styles.pressed]}
                onPress={onFavoritePress}
                accessibilityRole="button"
                accessibilityLabel={saved ? "إزالة من المفضلة" : "إضافة إلى المفضلة"}
              >
                <Icon name="favorite" size={18} color={saved ? colors.error : colors.onSurfaceVariant} />
                <Text style={styles.saveActionText}>حفظ</Text>
              </Pressable>
            </View>
          </View>
        </View>

        {/* index 1 — sticky tabs */}
        <View style={styles.tabsBar}>
          {TABS.map((tab) => {
            const active = activeTab === tab.key;
            return (
              <Pressable key={tab.key} style={styles.tab} onPress={() => scrollToSection(tab.key)}>
                <Text style={[styles.tabText, active && styles.tabTextActive]}>{tab.label}</Text>
                {active && <View style={styles.tabIndicator} />}
              </Pressable>
            );
          })}
        </View>

        {/* index 2 — body */}
        <View style={styles.body} onLayout={(e) => { bodyY.current = e.nativeEvent.layout.y; }}>
          <View style={styles.section} onLayout={(e) => { sectionY.current.about = e.nativeEvent.layout.y; }}>
            <Text style={styles.sectionTitle}>نبذة عن {company.name}</Text>
            <Text style={styles.about}>{company.about}</Text>

            {company.badges.length > 0 && (
              <View style={styles.credentials}>
                <Text style={styles.credentialsLabel}>الاعتمادات</Text>
                <View style={styles.credentialsRow}>
                  {company.badges.map((b) => (
                    <View key={b} style={styles.credentialChip}>
                      <Icon name="verified" size={13} color={colors.primary} />
                      <Text style={styles.credentialChipText}>{b}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </View>

          {(hasCatalog || company.services.length > 0) && (
            <View style={styles.section} onLayout={(e) => { sectionY.current.services = e.nativeEvent.layout.y; }}>
              {hasCatalog ? (
                <>
                  {services.length > 0 && (
                    <View style={styles.offeringGroup}>
                      <OfferingGroup title="الخدمات المقدّمة" items={services} onAdd={goRequest} />
                    </View>
                  )}
                  {products.length > 0 && (
                    <View style={styles.offeringGroup}>
                      <OfferingGroup title="المنتجات" items={products} onAdd={goRequest} />
                    </View>
                  )}
                </>
              ) : (
                <>
                  <Text style={styles.sectionTitle}>الخدمات المقدّمة</Text>
                  <View style={styles.legacyChips}>
                    {company.services.map((s) => (
                      <Pressable key={s} style={styles.legacyChip} onPress={() => goRequest()}>
                        <Icon name="check_circle" size={16} color={colors.primary} />
                        <Text style={styles.legacyChipText}>{s}</Text>
                      </Pressable>
                    ))}
                  </View>
                </>
              )}
            </View>
          )}

          {company.gallery.length > 0 && (
            <View style={styles.section} onLayout={(e) => { sectionY.current.gallery = e.nativeEvent.layout.y; }}>
              <CompanyGallery images={company.gallery} alt={company.name} />
            </View>
          )}

          {company.projects.length > 0 && (
            <View style={styles.section} onLayout={(e) => { sectionY.current.projects = e.nativeEvent.layout.y; }}>
              <Text style={styles.sectionTitle}>المشاريع ({company.projects.length})</Text>
              {company.projects.map((p, i) => {
                const open = openProject === i;
                return (
                  <View key={`${p.title}-${i}`} style={styles.projectCard}>
                    <Pressable style={styles.projectHeader} onPress={() => setOpenProject(open ? null : i)}>
                      <Image source={{ uri: assetUri(p.img) }} style={styles.projectThumb} />
                      <View style={styles.projectHeaderText}>
                        <Text style={styles.projectTitle} numberOfLines={1}>{p.title}</Text>
                        <Text style={styles.projectYear}>{p.year}</Text>
                      </View>
                      <Icon name="expand_more" size={20} color={colors.outline} style={open ? styles.projectChevronOpen : undefined} />
                    </Pressable>
                    {open && (
                      <View style={styles.projectBody}>
                        <Image source={{ uri: assetUri(p.img) }} style={styles.projectImage} />
                        <Text style={styles.projectDesc}>{p.description}</Text>
                        {company.services.length > 0 && (
                          <View style={styles.legacyChips}>
                            {company.services.map((s) => (
                              <View key={s} style={styles.projectServiceChip}>
                                <Text style={styles.projectServiceChipText}>{s}</Text>
                              </View>
                            ))}
                          </View>
                        )}
                        {company.location ? (
                          <View style={styles.projectLocationRow}>
                            <Icon name="location_on" size={14} color={colors.outline} />
                            <Text style={styles.projectLocation}>{company.location}</Text>
                          </View>
                        ) : null}
                      </View>
                    )}
                  </View>
                );
              })}

              <View style={styles.projectsCta}>
                <Text style={styles.projectsCtaText}>أعجبك ما رأيت؟ اطلب خدمة من {company.name}.</Text>
                <Pressable style={styles.projectsCtaBtn} onPress={onPrimaryPress}>
                  <Icon name={isBusy ? "hourglass_top" : "send"} size={16} color={colors.onPrimary} />
                  <Text style={styles.projectsCtaBtnText}>{primaryLabel}</Text>
                </Pressable>
              </View>
            </View>
          )}

          {company.reviews.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>آراء العملاء</Text>
              {company.reviews.slice(0, 5).map((r, i) => (
                <View key={i} style={styles.reviewCard}>
                  <Text style={styles.reviewRating}>{"★".repeat(r.rating)}</Text>
                  {r.text.trim() !== "" && <Text style={styles.reviewText}>{r.text}</Text>}
                  <View style={styles.reviewFooter}>
                    <View style={styles.reviewAvatar}>
                      <Text style={styles.reviewAvatarText}>{r.avatar}</Text>
                    </View>
                    <View>
                      <View style={styles.reviewAuthorRow}>
                        <Text style={styles.reviewAuthor}>{r.author}</Text>
                        {r.verified && <Icon name="verified" size={12} color={colors.primary} />}
                      </View>
                      <Text style={styles.reviewMeta}>{r.district}{r.date ? ` · ${r.date}` : ""}</Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          )}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>معلومات التواصل</Text>
            <View style={styles.contactCard}>
              <View style={styles.contactRow}>
                <Icon name="location_on" size={20} color={colors.primary} />
                <View>
                  <Text style={styles.contactLabel}>الموقع</Text>
                  <Text style={styles.contactValue}>{company.location}</Text>
                </View>
              </View>
              <View style={styles.contactRow}>
                <Icon name="bolt" size={20} color={colors.primary} />
                <View>
                  <Text style={styles.contactLabel}>زمن الاستجابة</Text>
                  <Text style={styles.contactValue}>{company.responseTime}</Text>
                </View>
              </View>
              <AvailabilityBadge company={company} />
              <Pressable style={styles.reportBtn} onPress={() => setFeedbackOpen(true)}>
                <Icon name="report_problem" size={18} color={colors.error} />
                <Text style={styles.reportBtnText}>الإبلاغ عن مشكلة</Text>
              </Pressable>
            </View>

            <View style={styles.finalCta}>
              <Icon name="handshake" size={28} color={colors.onPrimary} />
              <Text style={styles.finalCtaTitle}>مستعد للعمل معًا؟</Text>
              <Text style={styles.finalCtaSub}>أرسل طلبًا في أقل من دقيقة. سجّل دخولك بضغطة واحدة عشان تتابعه.</Text>
              <Pressable style={styles.finalCtaBtn} onPress={onPrimaryPress}>
                <Text style={styles.finalCtaBtnText}>{primaryLabel}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* App header — search/favorites left, centered logo, menu right, same
          transparent-over-cover → solid-on-scroll treatment as Home's. */}
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }, scrolled && styles.topBarSolid]}>
        <View style={styles.topBarGroup}>
          <Pressable accessibilityRole="button" accessibilityLabel="بحث" onPress={() => router.push("/search")} hitSlop={8}>
            <Icon name="search" size={24} color={scrolled ? colors.onSurface : "#fff"} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="المفضلة"
            onPress={() =>
              requireAccount(customer, () => router.push("/saved"), {
                title: "سجل الدخول لحفظ المفضلة",
                subtitle: "سجل الدخول عشان تقدر تحفظ الشركات والخدمات المفضلة عندك.",
                next: "/saved",
                secondary: { label: "ليس الآن", kind: "dismiss" },
              })
            }
            hitSlop={8}
          >
            <Icon name="favorite" size={24} color={scrolled ? colors.onSurface : "#fff"} />
          </Pressable>
        </View>
        <View style={[styles.topBarLogoWrap, { top: insets.top }]} pointerEvents="none">
          <Logo size={30} />
        </View>
        <View style={styles.topBarGroup}>
          <Pressable accessibilityRole="button" accessibilityLabel="القائمة" onPress={() => setMenuOpen(true)} hitSlop={8}>
            <Icon name="menu" size={24} color={scrolled ? colors.onSurface : "#fff"} />
          </Pressable>
        </View>
      </View>

      {/* Fixed action bar — favorite + primary CTA, above the safe area. This
          screen sits outside the (tabs) navigator (a stack push, like the
          website's own separate route), so there's no bottom tab bar under
          it to additionally clear here — only the device's own safe area. */}
      <View style={[styles.stickyBar, { paddingBottom: insets.bottom + 12 }]}>
        <Pressable
          style={({ pressed }) => [styles.stickyFavorite, pressed && styles.pressed]}
          onPress={onFavoritePress}
          accessibilityRole="button"
          accessibilityLabel={saved ? "إزالة من المفضلة" : "إضافة إلى المفضلة"}
        >
          <Icon name="favorite" size={20} color={saved ? colors.error : colors.onSurfaceVariant} />
        </Pressable>
        <Pressable style={({ pressed }) => [styles.stickyPrimary, pressed && styles.pressed]} onPress={onPrimaryPress}>
          <Icon name={isBusy ? "hourglass_top" : "send"} size={18} color={colors.onPrimary} />
          <Text style={styles.stickyPrimaryText}>{primaryLabel}</Text>
        </Pressable>
      </View>

      <FeedbackModal
        visible={feedbackOpen}
        companySlug={company.slug}
        companyName={company.name}
        onClose={() => setFeedbackOpen(false)}
      />
      <MenuModal visible={menuOpen} onClose={() => setMenuOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  centerFill: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 10 },
  errorText: { fontFamily: "Cairo_500Medium", fontSize: type.body.fontSize, color: colors.onSurfaceVariant, textAlign: "center" },
  backLink: { fontFamily: "Cairo_700Bold", fontSize: type.label.fontSize, color: colors.primary },
  pressed: { opacity: 0.85 },

  // ── Header ──
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    minHeight: HEADER_H,
    flexDirection: rowStart,
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 8,
    backgroundColor: "transparent",
  },
  topBarSolid: { backgroundColor: colors.surfaceContainerLowest, borderBottomWidth: 1, borderBottomColor: colors.outlineVariant },
  topBarGroup: { flexDirection: rowStart, alignItems: "center", gap: 16, minWidth: 22 },
  topBarLogoWrap: { position: "absolute", bottom: 0, left: 0, right: 0, alignItems: "center", justifyContent: "center" },

  // ── Cover + back pill ──
  coverWrap: { width: "100%", height: 220, backgroundColor: colors.surfaceContainer },
  cover: { width: "100%", height: "100%" },
  coverScrim: { ...StyleSheet.absoluteFillObject },
  backPill: {
    position: "absolute",
    right: 16,
    flexDirection: rowStart,
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(0,0,0,0.35)",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
  },
  backPillText: { fontFamily: "Cairo_700Bold", fontSize: type.caption.fontSize, color: "#fff" },

  // ── Identity ──
  identity: { padding: 20, gap: 12, backgroundColor: colors.surfaceContainerLowest, borderBottomWidth: 1, borderBottomColor: colors.outlineVariant },
  logoRow: { flexDirection: rowStart, alignItems: "center", gap: 12 },
  logo: { width: 60, height: 60, borderRadius: 16, backgroundColor: colors.surfaceContainer, borderWidth: 3, borderColor: colors.surfaceContainerLowest },
  identityText: { flex: 1, gap: 6 },
  nameRow: { flexDirection: rowStart, alignItems: "center", gap: 8, flexWrap: "wrap" },
  name: { fontFamily: "Alexandria_800ExtraBold", fontSize: type.title.fontSize, color: colors.onSurface, textAlign: "right" },
  verifiedBadge: { flexDirection: rowStart, alignItems: "center", gap: 4, backgroundColor: `${colors.primary}1a`, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  verifiedText: { fontFamily: "Cairo_700Bold", fontSize: 11, color: colors.primary },
  category: { fontFamily: "Cairo_400Regular", fontSize: type.label.fontSize, color: colors.outline, textAlign: "right" },
  statsRow: { flexDirection: rowStart, alignItems: "center", flexWrap: "wrap", gap: 6 },
  ratingStars: { color: "#f59e0b", fontSize: type.label.fontSize },
  ratingValue: { fontFamily: "Cairo_700Bold", fontSize: type.label.fontSize, color: colors.onSurface },
  statMuted: { fontFamily: "Cairo_400Regular", fontSize: type.caption.fontSize, color: colors.outline },
  statDot: { color: colors.outline },
  trustRow: { flexDirection: rowStart, flexWrap: "wrap", gap: 8 },
  trustPill: { flexDirection: rowStart, alignItems: "center", gap: 5, backgroundColor: colors.surfaceContainer, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  trustPillGreen: { backgroundColor: "#dcfce7" },
  trustPillText: { fontFamily: "Cairo_700Bold", fontSize: 11, color: colors.onSurfaceVariant },
  trustPillGreenText: { color: "#15803d" },
  busyBanner: { flexDirection: rowStart, alignItems: "flex-start", gap: 10, backgroundColor: colors.warningContainer, borderRadius: 14, padding: 12 },
  busyTextWrap: { flex: 1, gap: 2 },
  busyTitle: { fontFamily: "Cairo_700Bold", fontSize: type.label.fontSize, color: colors.onWarningContainer, textAlign: "right" },
  busyText: { fontFamily: "Cairo_400Regular", fontSize: type.caption.fontSize, color: colors.onWarningContainer, textAlign: "right" },
  actionsRow: { flexDirection: rowStart, gap: 10, marginTop: 4 },
  primaryAction: { flex: 1, flexDirection: rowStart, alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 13 },
  primaryActionText: { fontFamily: "Cairo_700Bold", fontSize: type.label.fontSize, color: colors.onPrimary },
  saveAction: { flexDirection: rowStart, alignItems: "center", gap: 6, borderWidth: 1, borderColor: colors.outlineVariant, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 13 },
  saveActionText: { fontFamily: "Cairo_700Bold", fontSize: type.label.fontSize, color: colors.onSurface },

  // ── Sticky tabs ──
  tabsBar: { flexDirection: rowStart, backgroundColor: colors.surfaceContainerLowest, borderBottomWidth: 1, borderBottomColor: colors.outlineVariant, paddingHorizontal: 12 },
  tab: { paddingHorizontal: 12, paddingVertical: 12, alignItems: "center" },
  tabText: { fontFamily: "Cairo_700Bold", fontSize: type.label.fontSize, color: colors.outline },
  tabTextActive: { color: colors.primary },
  tabIndicator: { position: "absolute", bottom: 0, left: 12, right: 12, height: 2, backgroundColor: colors.primary, borderRadius: 1 },

  // ── Body / sections ──
  body: { padding: 20, gap: 32 },
  section: { gap: 4 },
  sectionTitle: { fontFamily: "Cairo_700Bold", fontSize: type.subhead.fontSize, color: colors.onSurface, textAlign: "right", marginBottom: 10 },
  about: { fontFamily: "Cairo_400Regular", fontSize: type.body.fontSize, color: colors.onSurfaceVariant, textAlign: "right", lineHeight: 24 },
  credentials: { marginTop: 16 },
  credentialsLabel: { fontFamily: "Cairo_700Bold", fontSize: type.caption.fontSize, color: colors.outline, textAlign: "right", marginBottom: 8 },
  credentialsRow: { flexDirection: rowStart, flexWrap: "wrap", gap: 8 },
  credentialChip: { flexDirection: rowStart, alignItems: "center", gap: 5, backgroundColor: `${colors.primary}14`, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7 },
  credentialChipText: { fontFamily: "Cairo_700Bold", fontSize: type.caption.fontSize, color: colors.primary },

  offeringGroup: { marginBottom: 20 },
  offeringList: { gap: 12 },
  legacyChips: { flexDirection: rowStart, flexWrap: "wrap", gap: 8 },
  legacyChip: { flexDirection: rowStart, alignItems: "center", gap: 6, backgroundColor: colors.surfaceContainerLowest, borderWidth: 1, borderColor: colors.outlineVariant, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
  legacyChipText: { fontFamily: "Cairo_600SemiBold", fontSize: type.label.fontSize, color: colors.onSurface },

  projectCard: { backgroundColor: colors.surfaceContainer, borderRadius: 14, marginBottom: 8, overflow: "hidden" },
  projectHeader: { flexDirection: rowStart, alignItems: "center", gap: 10, padding: 10 },
  projectThumb: { width: 48, height: 48, borderRadius: 10, backgroundColor: colors.surfaceContainerHigh },
  projectHeaderText: { flex: 1, gap: 2 },
  projectTitle: { fontFamily: "Cairo_700Bold", fontSize: type.label.fontSize, color: colors.onSurface, textAlign: "right" },
  projectYear: { fontFamily: "Cairo_400Regular", fontSize: type.caption.fontSize, color: colors.outline, textAlign: "right" },
  projectChevronOpen: { transform: [{ rotate: "180deg" }] },
  projectBody: { paddingHorizontal: 12, paddingBottom: 12, gap: 10 },
  projectImage: { width: "100%", height: 160, borderRadius: 12, backgroundColor: colors.surfaceContainerHigh },
  projectDesc: { fontFamily: "Cairo_400Regular", fontSize: type.label.fontSize, color: colors.onSurfaceVariant, textAlign: "right", lineHeight: 20 },
  projectServiceChip: { backgroundColor: `${colors.primary}14`, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5 },
  projectServiceChipText: { fontFamily: "Cairo_700Bold", fontSize: type.caption.fontSize, color: colors.primary },
  projectLocationRow: { flexDirection: rowStart, alignItems: "center", gap: 4 },
  projectLocation: { fontFamily: "Cairo_400Regular", fontSize: type.caption.fontSize, color: colors.outline },
  projectsCta: { marginTop: 16, backgroundColor: colors.surfaceContainerLowest, borderRadius: 16, padding: 20, alignItems: "center", gap: 12, borderWidth: 1, borderColor: colors.outlineVariant },
  projectsCtaText: { fontFamily: "Cairo_600SemiBold", fontSize: type.label.fontSize, color: colors.outline, textAlign: "center" },
  projectsCtaBtn: { flexDirection: rowStart, alignItems: "center", gap: 8, backgroundColor: colors.primary, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 12 },
  projectsCtaBtnText: { fontFamily: "Cairo_700Bold", fontSize: type.label.fontSize, color: colors.onPrimary },

  reviewCard: { backgroundColor: colors.surfaceContainer, borderRadius: 14, padding: 14, marginBottom: 8, gap: 8 },
  reviewRating: { color: "#f59e0b", fontSize: type.body.fontSize, textAlign: "right" },
  reviewText: { fontFamily: "Cairo_400Regular", fontSize: type.label.fontSize, color: colors.onSurfaceVariant, textAlign: "right", lineHeight: 20 },
  reviewFooter: { flexDirection: rowStart, alignItems: "center", gap: 10 },
  reviewAvatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: `${colors.primary}1a`, alignItems: "center", justifyContent: "center" },
  reviewAvatarText: { fontFamily: "Cairo_700Bold", fontSize: type.label.fontSize, color: colors.primary },
  reviewAuthorRow: { flexDirection: rowStart, alignItems: "center", gap: 4 },
  reviewAuthor: { fontFamily: "Cairo_700Bold", fontSize: type.caption.fontSize, color: colors.onSurface },
  reviewMeta: { fontFamily: "Cairo_400Regular", fontSize: type.caption.fontSize, color: colors.outline },

  contactCard: { backgroundColor: colors.surfaceContainerLowest, borderWidth: 1, borderColor: colors.outlineVariant, borderRadius: 16, padding: 16, gap: 14 },
  contactRow: { flexDirection: rowStart, alignItems: "center", gap: 12 },
  contactLabel: { fontFamily: "Cairo_400Regular", fontSize: type.caption.fontSize, color: colors.outline, textAlign: "right" },
  contactValue: { fontFamily: "Cairo_700Bold", fontSize: type.label.fontSize, color: colors.onSurface, textAlign: "right" },
  reportBtn: { flexDirection: rowStart, alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1, borderColor: `${colors.error}4d`, borderRadius: 12, paddingVertical: 12 },
  reportBtnText: { fontFamily: "Cairo_700Bold", fontSize: type.label.fontSize, color: colors.error },

  finalCta: { marginTop: 16, backgroundColor: colors.primary, borderRadius: 18, padding: 22, alignItems: "flex-end", gap: 8 },
  finalCtaTitle: { fontFamily: "Alexandria_700Bold", fontSize: type.title.fontSize, color: colors.onPrimary, textAlign: "right" },
  finalCtaSub: { fontFamily: "Cairo_400Regular", fontSize: type.label.fontSize, color: colors.onPrimary, opacity: 0.9, textAlign: "right", lineHeight: 20, alignSelf: "stretch" },
  finalCtaBtn: { alignSelf: "stretch", backgroundColor: "#fff", borderRadius: 12, paddingVertical: 13, alignItems: "center", marginTop: 6 },
  finalCtaBtnText: { fontFamily: "Cairo_700Bold", fontSize: type.label.fontSize, color: colors.primary },

  // ── Sticky bottom action bar ──
  stickyBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: rowStart,
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 10,
    backgroundColor: colors.surfaceContainerLowest,
    borderTopWidth: 1,
    borderTopColor: colors.outlineVariant,
  },
  stickyFavorite: { width: 48, height: 48, borderRadius: 12, borderWidth: 1, borderColor: colors.outlineVariant, alignItems: "center", justifyContent: "center" },
  stickyPrimary: { flex: 1, flexDirection: rowStart, alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.primary, borderRadius: 12 },
  stickyPrimaryText: { fontFamily: "Cairo_700Bold", fontSize: type.body.fontSize, color: colors.onPrimary },
});
