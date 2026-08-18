import { useEffect, useState } from "react";
import { FlatList, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import type { ApiCategory, ApiCompany, ApiSiteReview } from "@alassema/core";
import { colors, type } from "@alassema/core";
import Icon from "../../components/Icon";
import Logo from "../../components/Logo";
import SiteReviewModal from "../../components/SiteReviewModal";
import { fetchCategories } from "../../lib/categories";
import { fetchCompanies } from "../../lib/companies";
import { fetchFeaturedProjects, type FeaturedProject } from "../../lib/projects";
import { fetchSiteReviews, fetchSiteReviewSettings } from "../../lib/siteReviews";

const REASONS = [
  { icon: "check_circle" as const, title: "شركات موثّقة", desc: "كل شركة اتراجعت قبل ما تنشر" },
  { icon: "favorite" as const, title: "جودة مضمونة", desc: "تقييمات حقيقية من عملاء حقيقيين" },
  { icon: "send" as const, title: "رد سريع", desc: "أرسل طلبك في أقل من دقيقة" },
];

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
  const [projects, setProjects] = useState<FeaturedProject[]>([]);
  const [reviews, setReviews] = useState<ApiSiteReview[]>([]);
  const [reviewsEnabled, setReviewsEnabled] = useState(false);
  const [reviewModalOpen, setReviewModalOpen] = useState(false);

  const loadReviews = () => fetchSiteReviews().then(setReviews).catch(() => {});

  useEffect(() => {
    fetchCategories().then(setCategories).catch(() => setCategories([]));
    fetchCompanies()
      .then((page) => setFeatured(page.data.slice(0, 6)))
      .catch(() => setFeatured([]));
    fetchFeaturedProjects().then(setProjects).catch(() => {});
    fetchSiteReviewSettings().then((s) => setReviewsEnabled(s.enabled)).catch(() => {});
    loadReviews();
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.topBar}>
        <Logo size={30} />
      </View>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.hero}>
          <Text style={styles.heroTitle}>كل خدمة موثوقة في العاصمة الإدارية</Text>
          <Text style={styles.heroSub}>شركات متخصصة، تقييمات حقيقية، وراحة بال كاملة</Text>
          <Pressable style={styles.heroCta} onPress={() => router.push("/companies")}>
            <Icon name="search" size={16} color={colors.onPrimary} />
            <Text style={styles.heroCtaText}>دوّر على شركة</Text>
          </Pressable>
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
              style={styles.categoryChip}
              onPress={() => router.push({ pathname: "/services/[slug]", params: { slug: c.slug } })}
            >
              <Icon name="favorite" size={18} color={colors.primary} />
              <Text style={styles.categoryLabel} numberOfLines={1}>{c.label}</Text>
              <Text style={styles.categoryCount}>{c.count}</Text>
            </Pressable>
          ))}
        </ScrollView>

        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>شركات مميزة</Text>
          <Pressable onPress={() => router.push("/companies")}>
            <Text style={styles.sectionLink}>الكل</Text>
          </Pressable>
        </View>
        <FlatList
          data={featured ?? []}
          keyExtractor={(c) => c.id}
          scrollEnabled={false}
          contentContainerStyle={styles.featuredList}
          renderItem={({ item }) => (
            <Pressable
              style={styles.featuredCard}
              onPress={() => router.push({ pathname: "/company/[slug]", params: { slug: item.slug } })}
            >
              <Image source={{ uri: item.logo }} style={styles.featuredLogo} />
              <View style={styles.featuredText}>
                <Text style={styles.featuredName} numberOfLines={1}>{item.name}</Text>
                <Text style={styles.featuredCategory} numberOfLines={1}>{item.categoryLabel}</Text>
              </View>
              <View style={styles.ratingChip}>
                <Text style={styles.ratingText}>{item.rating.toFixed(1)}</Text>
                <Text style={styles.ratingStar}>★</Text>
              </View>
            </Pressable>
          )}
        />

        {projects.length > 0 && (
          <>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>مشاريع مميزة</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.projectRow}>
              {projects.map((p, i) => (
                <View key={`${p.title}-${i}`} style={styles.projectCard}>
                  <Image source={{ uri: p.img }} style={styles.projectImage} />
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

        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>آراء العملاء</Text>
          <Pressable
            onPress={() => reviewsEnabled && setReviewModalOpen(true)}
            disabled={!reviewsEnabled}
          >
            <Text style={[styles.sectionLink, !reviewsEnabled && styles.sectionLinkDisabled]}>شارك رأيك</Text>
          </Pressable>
        </View>
        {reviews.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.reviewRow}>
            {reviews.map((r) => (
              <View key={r.id} style={styles.reviewCard}>
                <Text style={styles.reviewStars}>{"★".repeat(r.rating)}</Text>
                <Text style={styles.reviewText} numberOfLines={4}>{r.text}</Text>
                <View style={styles.reviewFooter}>
                  <View style={styles.reviewAvatar}>
                    <Text style={styles.reviewAvatarText}>{r.name.charAt(0)}</Text>
                  </View>
                  <View>
                    <Text style={styles.reviewName}>{r.name}</Text>
                    <Text style={styles.reviewDistrict}>{r.district}</Text>
                  </View>
                </View>
              </View>
            ))}
          </ScrollView>
        ) : (
          <Text style={styles.noReviews}>لسه مفيش آراء منشورة.</Text>
        )}

        <Pressable style={styles.guidedCard} onPress={() => router.push("/guided-start")}>
          <View style={styles.guidedIcon}>
            <Icon name="check_circle" size={22} color={colors.primary} />
          </View>
          <View style={styles.guidedText}>
            <Text style={styles.guidedTitle}>مش عارف تختار مين؟</Text>
            <Text style={styles.guidedDesc}>جاوب على سؤالين ونرشّحلك أفضل شركة</Text>
          </View>
          <Icon name="chevron_right" size={20} color={colors.outline} style={{ transform: [{ scaleX: -1 }] }} />
        </Pressable>

        <View style={styles.footerLinks}>
          <Pressable onPress={() => router.push("/about")}>
            <Text style={styles.footerLink}>عن العاصمة</Text>
          </Pressable>
          <Pressable onPress={() => router.push("/contact")}>
            <Text style={styles.footerLink}>تواصل معنا</Text>
          </Pressable>
        </View>
      </ScrollView>

      <SiteReviewModal
        visible={reviewModalOpen}
        onClose={() => setReviewModalOpen(false)}
        onSubmitted={() => {
          setReviewModalOpen(false);
          loadReviews();
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  topBar: { flexDirection: "row-reverse", paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4 },
  scroll: { paddingBottom: 32 },
  hero: { backgroundColor: colors.primary, padding: 24, paddingTop: 16, gap: 8, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  heroTitle: { fontSize: type.headline.fontSize, fontFamily: "Alexandria_800ExtraBold", color: colors.onPrimary, textAlign: "right", lineHeight: 34 },
  heroSub: { fontSize: type.body.fontSize, fontFamily: "Cairo_400Regular", color: colors.onPrimary, opacity: 0.85, textAlign: "right" },
  heroCta: { flexDirection: "row-reverse", alignItems: "center", gap: 6, backgroundColor: "rgba(255,255,255,0.15)", alignSelf: "flex-end", paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999, marginTop: 8 },
  heroCtaText: { fontFamily: "Cairo_700Bold", fontSize: type.label.fontSize, color: colors.onPrimary },
  reasonsRow: { flexDirection: "row-reverse", gap: 10, padding: 20 },
  reasonCard: { flex: 1, backgroundColor: colors.surfaceContainerLowest, borderRadius: 14, padding: 12, gap: 4, borderWidth: 1, borderColor: colors.outlineVariant },
  reasonTitle: { fontFamily: "Cairo_700Bold", fontSize: type.caption.fontSize, color: colors.onSurface, textAlign: "right" },
  reasonDesc: { fontFamily: "Cairo_400Regular", fontSize: 10, color: colors.outline, textAlign: "right" },
  sectionHead: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, marginTop: 8, marginBottom: 10 },
  sectionTitle: { fontFamily: "Cairo_700Bold", fontSize: type.subhead.fontSize, color: colors.onSurface },
  sectionLink: { fontFamily: "Cairo_600SemiBold", fontSize: type.label.fontSize, color: colors.primary },
  categoryRow: { flexDirection: "row-reverse", paddingHorizontal: 20 },
  categoryChip: { alignItems: "center", gap: 4, backgroundColor: colors.surfaceContainer, borderRadius: 14, padding: 12, width: 92, marginStart: 10 },
  categoryLabel: { fontFamily: "Cairo_600SemiBold", fontSize: 11, color: colors.onSurface, textAlign: "center" },
  categoryCount: { fontFamily: "Cairo_400Regular", fontSize: 10, color: colors.outline },
  featuredList: { paddingHorizontal: 20, gap: 8 },
  featuredCard: { flexDirection: "row-reverse", alignItems: "center", gap: 12, backgroundColor: colors.surfaceContainerLowest, borderRadius: 14, padding: 10, borderWidth: 1, borderColor: colors.outlineVariant },
  featuredLogo: { width: 40, height: 40, borderRadius: 10, backgroundColor: colors.surfaceContainer },
  featuredText: { flex: 1 },
  featuredName: { fontFamily: "Cairo_700Bold", fontSize: type.label.fontSize, color: colors.onSurface, textAlign: "right" },
  featuredCategory: { fontFamily: "Cairo_400Regular", fontSize: type.caption.fontSize, color: colors.outline, textAlign: "right" },
  ratingChip: { flexDirection: "row-reverse", alignItems: "center", gap: 2 },
  ratingText: { fontFamily: "Cairo_700Bold", fontSize: type.caption.fontSize, color: colors.onSurface },
  ratingStar: { color: "#f59e0b", fontSize: type.caption.fontSize },
  projectRow: { flexDirection: "row-reverse", paddingHorizontal: 20 },
  projectCard: { width: 220, height: 140, borderRadius: 14, overflow: "hidden", marginStart: 10, backgroundColor: colors.surfaceContainer },
  projectImage: { width: "100%", height: "100%" },
  projectOverlay: { position: "absolute", bottom: 0, left: 0, right: 0, padding: 10, backgroundColor: "rgba(0,0,0,0.45)" },
  projectCategory: { fontFamily: "Cairo_700Bold", fontSize: 10, color: colors.onPrimary, marginBottom: 2, alignSelf: "flex-end" },
  projectTitle: { fontFamily: "Cairo_700Bold", fontSize: type.label.fontSize, color: "#fff", textAlign: "right" },
  projectCompany: { fontFamily: "Cairo_400Regular", fontSize: type.caption.fontSize, color: "rgba(255,255,255,0.8)", textAlign: "right" },
  sectionLinkDisabled: { color: colors.outline },
  reviewRow: { flexDirection: "row-reverse", paddingHorizontal: 20 },
  reviewCard: { width: 240, backgroundColor: colors.surfaceContainerLowest, borderRadius: 16, padding: 14, marginStart: 10, borderWidth: 1, borderColor: colors.outlineVariant, gap: 8 },
  reviewStars: { color: "#f59e0b", fontSize: type.body.fontSize, textAlign: "right" },
  reviewText: { fontFamily: "Cairo_400Regular", fontSize: type.label.fontSize, color: colors.onSurfaceVariant, textAlign: "right", lineHeight: 20 },
  reviewFooter: { flexDirection: "row-reverse", alignItems: "center", gap: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.outlineVariant },
  reviewAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  reviewAvatarText: { color: colors.onPrimary, fontFamily: "Cairo_700Bold", fontSize: type.caption.fontSize },
  reviewName: { fontFamily: "Cairo_700Bold", fontSize: type.caption.fontSize, color: colors.onSurface, textAlign: "right" },
  reviewDistrict: { fontFamily: "Cairo_400Regular", fontSize: 10, color: colors.outline, textAlign: "right" },
  noReviews: { fontFamily: "Cairo_400Regular", fontSize: type.label.fontSize, color: colors.outline, textAlign: "center", paddingVertical: 12 },
  guidedCard: { flexDirection: "row-reverse", alignItems: "center", gap: 12, backgroundColor: colors.surfaceContainerLowest, marginHorizontal: 20, marginTop: 24, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: colors.outlineVariant },
  guidedIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.primaryContainer, alignItems: "center", justifyContent: "center" },
  guidedText: { flex: 1 },
  guidedTitle: { fontFamily: "Cairo_700Bold", fontSize: type.body.fontSize, color: colors.onSurface, textAlign: "right" },
  guidedDesc: { fontFamily: "Cairo_400Regular", fontSize: type.caption.fontSize, color: colors.outline, textAlign: "right" },
  footerLinks: { flexDirection: "row-reverse", justifyContent: "center", gap: 24, marginTop: 24 },
  footerLink: { fontFamily: "Cairo_600SemiBold", fontSize: type.label.fontSize, color: colors.outline, textDecorationLine: "underline" },
});
