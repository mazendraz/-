import { useEffect, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import type { ApiCompany } from "@alassema/core";
import { colors, type } from "@alassema/core";
import Icon from "../../components/Icon";
import Button from "../../components/Button";
import { fetchCompany } from "../../lib/companyDetail";
import { useIsSaved } from "../../lib/saved";
import { ApiError } from "../../lib/api";

/**
 * The company profile — the context a customer was missing between "search
 * result" and "fill out a form": what they do, their rating, real reviews,
 * finished projects, and whether they're even taking requests right now.
 *
 * Deliberately NOT the website's full CompanyProfile.tsx (the priced
 * offerings catalog — Feature C — is real, separate scope: quantities, tiers,
 * package discounts, a cart). What's here is everything that helps a customer
 * decide, and the classic single-service form new-request/[slug] already
 * built is still the right next step either way.
 */
export default function CompanyProfile() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const [company, setCompany] = useState<ApiCompany | null>(null);
  const [error, setError] = useState("");
  const { saved, toggle } = useIsSaved(slug);

  useEffect(() => {
    fetchCompany(slug)
      .then(setCompany)
      .catch((err) => setError(err instanceof ApiError ? err.message : "تعذّر تحميل بيانات الشركة."));
  }, [slug]);

  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerFill}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      </SafeAreaView>
    );
  }
  if (!company) return null;

  const isBusy = company.busy;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Icon name="arrow_back" size={22} color={colors.onSurface} />
          </Pressable>
          <Pressable onPress={toggle} hitSlop={12}>
            <Icon name="favorite" size={22} color={saved ? colors.error : colors.outlineVariant} />
          </Pressable>
        </View>

        <Image source={{ uri: company.cover || company.logo }} style={styles.cover} />

        <View style={styles.body}>
          <Text style={styles.name}>{company.name}</Text>
          <Text style={styles.tagline}>{company.tagline}</Text>

          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{company.rating.toFixed(1)}</Text>
              <Text style={styles.statLabel}>({company.reviewCount}) التقييم</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{company.completedProjects}</Text>
              <Text style={styles.statLabel}>مشروع منجز</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{company.yearsExperience}</Text>
              <Text style={styles.statLabel}>سنة خبرة</Text>
            </View>
          </View>

          {isBusy && (
            <View style={styles.busyBanner}>
              <Icon name="error" size={18} color={colors.onWarningContainer} />
              <Text style={styles.busyText}>
                {company.busyNote || "الشركة مشغولة دلوقتي — تقدر تنضم لقائمة الانتظار."}
              </Text>
            </View>
          )}

          <Text style={styles.sectionTitle}>عن الشركة</Text>
          <Text style={styles.about}>{company.about}</Text>

          {company.gallery.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>معرض الأعمال</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.galleryRow}>
                {company.gallery.map((uri) => (
                  <Image key={uri} source={{ uri }} style={styles.galleryImage} />
                ))}
              </ScrollView>
            </>
          )}

          {company.reviews.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>آراء العملاء</Text>
              {company.reviews.slice(0, 5).map((r, i) => (
                <View key={i} style={styles.reviewCard}>
                  <View style={styles.reviewHeader}>
                    <Text style={styles.reviewAuthor}>{r.author}</Text>
                    <Text style={styles.reviewRating}>{"★".repeat(r.rating)}</Text>
                  </View>
                  {r.text ? <Text style={styles.reviewText}>{r.text}</Text> : null}
                </View>
              ))}
            </>
          )}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Button
          label={isBusy ? "الانضمام لقائمة الانتظار" : "اطلب الخدمة"}
          onPress={() =>
            router.push(
              isBusy
                ? { pathname: "/company/[slug]/waitlist", params: { slug: company.slug, name: company.name } }
                : { pathname: "/new-request/[slug]", params: { slug: company.slug, name: company.name } },
            )
          }
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  centerFill: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  errorText: { fontFamily: "Cairo_500Medium", fontSize: type.body.fontSize, color: colors.onSurfaceVariant, textAlign: "center" },
  scroll: { paddingBottom: 100 },
  header: {
    position: "absolute",
    top: 12,
    left: 16,
    right: 16,
    zIndex: 1,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  cover: { width: "100%", height: 200, backgroundColor: colors.surfaceContainer },
  body: { padding: 20, gap: 4 },
  name: { fontSize: type.headline.fontSize, fontFamily: "Alexandria_700Bold", color: colors.onSurface, textAlign: "right" },
  tagline: { fontSize: type.body.fontSize, fontFamily: "Cairo_400Regular", color: colors.outline, textAlign: "right", marginBottom: 12 },
  statsRow: { flexDirection: "row-reverse", gap: 20, marginBottom: 16 },
  stat: { alignItems: "center" },
  statValue: { fontFamily: "Cairo_700Bold", fontSize: type.subhead.fontSize, color: colors.primary },
  statLabel: { fontFamily: "Cairo_400Regular", fontSize: type.caption.fontSize, color: colors.outline },
  busyBanner: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.warningContainer,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  busyText: { flex: 1, fontFamily: "Cairo_500Medium", fontSize: type.label.fontSize, color: colors.onWarningContainer, textAlign: "right" },
  sectionTitle: { fontFamily: "Cairo_700Bold", fontSize: type.subhead.fontSize, color: colors.onSurface, textAlign: "right", marginTop: 16, marginBottom: 8 },
  about: { fontFamily: "Cairo_400Regular", fontSize: type.body.fontSize, color: colors.onSurfaceVariant, textAlign: "right", lineHeight: 24 },
  galleryRow: { flexDirection: "row-reverse" },
  galleryImage: { width: 140, height: 100, borderRadius: 12, marginStart: 10, backgroundColor: colors.surfaceContainer },
  reviewCard: { backgroundColor: colors.surfaceContainer, borderRadius: 12, padding: 12, marginBottom: 8 },
  reviewHeader: { flexDirection: "row-reverse", justifyContent: "space-between" },
  reviewAuthor: { fontFamily: "Cairo_700Bold", fontSize: type.label.fontSize, color: colors.onSurface },
  reviewRating: { color: "#f59e0b", fontSize: type.label.fontSize },
  reviewText: { fontFamily: "Cairo_400Regular", fontSize: type.label.fontSize, color: colors.onSurfaceVariant, textAlign: "right", marginTop: 4 },
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.outlineVariant,
  },
});
