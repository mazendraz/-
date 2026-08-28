import { useEffect, useRef, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import type { ApiCategory, ApiCompany } from "@alassema/core";
import { colors, type } from "@alassema/core";
import Icon, { type IconName } from "../components/Icon";
import { fetchCategories } from "../lib/categories";
import { fetchCompanies } from "../lib/companies";
import { assetUri } from "../lib/assetUrl";

type Priority = "rating" | "projects" | "reviews";

const PRIORITIES: { key: Priority; icon: IconName; title: string; desc: string }[] = [
  { key: "rating", icon: "star", title: "أعلى تقييم", desc: "شركات بأعلى تقييم من العملاء" },
  { key: "projects", icon: "check_circle", title: "أكتر خبرة", desc: "شركات أنجزت مشاريع أكتر" },
  { key: "reviews", icon: "forum", title: "أكتر آراء", desc: "شركات عليها تقييمات أكتر" },
];

const SORTERS: Record<Priority, (a: ApiCompany, b: ApiCompany) => number> = {
  rating: (a, b) => b.rating - a.rating,
  projects: (a, b) => b.completedProjects - a.completedProjects,
  reviews: (a, b) => b.reviewCount - a.reviewCount,
};

/**
 * A two-question matching quiz: category → priority → a ranked shortlist —
 * the mobile counterpart of the website's GuidedStart.tsx. Purely client-side
 * over already-available category/company data, same as the website's copy;
 * no session persistence here since expo-router already keeps this screen on
 * the stack (unlike a browser tab that can be closed and reopened).
 */
export default function GuidedStart() {
  const [step, setStep] = useState(0);
  const [categories, setCategories] = useState<ApiCategory[]>([]);
  const [category, setCategory] = useState<ApiCategory | null>(null);
  const [priority, setPriority] = useState<Priority | null>(null);
  const [matches, setMatches] = useState<ApiCompany[]>([]);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [matchesFailed, setMatchesFailed] = useState(false);

  useEffect(() => {
    fetchCategories().then(setCategories).catch(() => setCategories([]));
  }, []);

  const lastRequest = useRef(0);
  async function pickPriority(p: Priority) {
    setPriority(p);
    setStep(2);
    if (!category) return;
    const requestId = ++lastRequest.current;
    setLoadingMatches(true);
    setMatchesFailed(false);
    try {
      const page = await fetchCompanies(undefined, { category: category.slug, pageSize: 50 });
      const pool = page.data.length > 0 ? page.data : (await fetchCompanies(undefined, { pageSize: 50 })).data;
      if (requestId !== lastRequest.current) return;
      setMatches([...pool].sort(SORTERS[p]).slice(0, 3));
    } catch {
      // Previously fell straight through to the empty-matches state — "مفيش
      // نتايج مطابقة" ("nothing matches you") is a wrong and worse message
      // for a failed request than for a genuine empty catalogue: it reads as
      // a verdict on the customer's answers rather than as the network
      // problem it actually is.
      if (requestId === lastRequest.current) {
        setMatches([]);
        setMatchesFailed(true);
      }
    } finally {
      if (requestId === lastRequest.current) setLoadingMatches(false);
    }
  }

  function reset() {
    setStep(0);
    setCategory(null);
    setPriority(null);
    setMatches([]);
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        {step > 0 ? (
          <Pressable accessibilityRole="button" accessibilityLabel="رجوع" onPress={() => setStep((s) => s - 1)} hitSlop={12}>
            <Icon name="arrow_back" size={22} color={colors.onSurface} style={{ transform: [{ scaleX: -1 }] }} />
          </Pressable>
        ) : (
          <Pressable accessibilityRole="button" accessibilityLabel="إغلاق" onPress={() => router.back()} hitSlop={12}>
            <Icon name="close" size={22} color={colors.onSurface} />
          </Pressable>
        )}
        <View style={styles.progressRow}>
          {[0, 1, 2].map((s) => (
            <View key={s} style={[styles.progressDot, s <= step && styles.progressDotActive]} />
          ))}
        </View>
        <View style={{ width: 22 }} />
      </View>

      {step === 0 && (
        <View style={styles.stepBody}>
          <Text style={styles.eyebrow}>الخطوة ١</Text>
          <Text style={styles.question}>محتاج أنهي خدمة؟</Text>
          <FlatList
            data={categories}
            keyExtractor={(c) => c.slug}
            numColumns={2}
            columnWrapperStyle={styles.grid}
            contentContainerStyle={styles.gridList}
            renderItem={({ item }) => (
              <Pressable
                style={styles.optionCard}
                onPress={() => {
                  setCategory(item);
                  setStep(1);
                }}
              >
                <Text style={styles.optionTitle} numberOfLines={2}>{item.label}</Text>
                <Text style={styles.optionMeta}>{item.count} شركة</Text>
              </Pressable>
            )}
          />
        </View>
      )}

      {step === 1 && (
        <View style={styles.stepBody}>
          <Text style={styles.eyebrow}>الخطوة ٢</Text>
          <Text style={styles.question}>الأهم بالنسبالك إيه في {category?.label}؟</Text>
          <View style={styles.priorityList}>
            {PRIORITIES.map((p) => (
              <Pressable key={p.key} style={styles.priorityCard} onPress={() => pickPriority(p.key)}>
                <View style={styles.priorityIcon}>
                  <Icon name={p.icon} size={20} color={colors.primary} />
                </View>
                <View style={styles.priorityText}>
                  <Text style={styles.priorityTitle}>{p.title}</Text>
                  <Text style={styles.priorityDesc}>{p.desc}</Text>
                </View>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {step === 2 && (
        <FlatList
          data={matches}
          keyExtractor={(c) => c.id}
          contentContainerStyle={styles.stepBody}
          ListHeaderComponent={
            <>
              <Text style={styles.eyebrow}>أفضل ترشيحات</Text>
              <Text style={styles.question}>
                {loadingMatches
                  ? "بندوّر على أفضل شركات..."
                  : matchesFailed
                    ? "تعذّر تحميل الترشيحات"
                    : matches.length > 0
                      ? "أفضل شركات ليك"
                      : "مفيش نتايج مطابقة"}
              </Text>
              {matchesFailed && !loadingMatches && (
                <Pressable style={styles.secondaryBtn} onPress={() => pickPriority(priority!)}>
                  <Text style={styles.secondaryBtnText}>حاول تاني</Text>
                </Pressable>
              )}
            </>
          }
          renderItem={({ item, index }) => (
            <Pressable
              style={styles.matchCard}
              onPress={() => router.push({ pathname: "/company/[slug]", params: { slug: item.slug } })}
            >
              {index === 0 && (
                <View style={styles.bestBadge}>
                  <Icon name="star" size={12} color={colors.onPrimary} />
                  <Text style={styles.bestBadgeText}>أفضل ترشيح</Text>
                </View>
              )}
              <View style={styles.matchRow}>
                <Image source={{ uri: assetUri(item.logo) }} style={styles.matchLogo} />
                <View style={styles.matchText}>
                  <Text style={styles.matchName} numberOfLines={1}>{item.name}</Text>
                  <Text style={styles.matchMeta}>★ {item.rating.toFixed(1)} · {item.reviewCount} تقييم</Text>
                </View>
              </View>
            </Pressable>
          )}
          ListFooterComponent={
            <View style={styles.actions}>
              <Pressable
                style={styles.secondaryBtn}
                onPress={() => router.push(category ? { pathname: "/services/[slug]", params: { slug: category.slug } } : "/companies")}
              >
                <Text style={styles.secondaryBtnText}>شوف كل شركات {category?.label}</Text>
              </Pressable>
              <Pressable style={styles.primaryBtn} onPress={reset}>
                <Text style={styles.primaryBtnText}>ابدأ من جديد</Text>
              </Pressable>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingBottom: 12 },
  progressRow: { flexDirection: "row-reverse", gap: 6, flex: 1, marginHorizontal: 16 },
  progressDot: { height: 5, borderRadius: 3, flex: 1, backgroundColor: colors.surfaceContainerHigh },
  progressDotActive: { backgroundColor: colors.primary },
  stepBody: { paddingHorizontal: 20, paddingBottom: 24 },
  eyebrow: { fontFamily: "Cairo_800ExtraBold", fontSize: type.caption.fontSize, color: colors.primary, textAlign: "right", marginBottom: 4 },
  question: { fontFamily: "Alexandria_700Bold", fontSize: type.headline.fontSize, color: colors.onSurface, textAlign: "right", marginBottom: 18, lineHeight: 32 },
  grid: { gap: 10 },
  gridList: { gap: 10 },
  optionCard: { flex: 1, backgroundColor: colors.surfaceContainerLowest, borderRadius: 14, padding: 14, gap: 6, borderWidth: 1, borderColor: colors.outlineVariant },
  optionTitle: { fontFamily: "Cairo_700Bold", fontSize: type.label.fontSize, color: colors.onSurface, textAlign: "right" },
  optionMeta: { fontFamily: "Cairo_400Regular", fontSize: type.caption.fontSize, color: colors.outline, textAlign: "right" },
  priorityList: { gap: 10 },
  priorityCard: { flexDirection: "row-reverse", alignItems: "center", gap: 12, backgroundColor: colors.surfaceContainerLowest, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: colors.outlineVariant },
  priorityIcon: { width: 40, height: 40, borderRadius: 10, backgroundColor: colors.primaryContainer, alignItems: "center", justifyContent: "center" },
  priorityText: { flex: 1 },
  priorityTitle: { fontFamily: "Cairo_700Bold", fontSize: type.body.fontSize, color: colors.onSurface, textAlign: "right" },
  priorityDesc: { fontFamily: "Cairo_400Regular", fontSize: type.caption.fontSize, color: colors.outline, textAlign: "right" },
  matchCard: { backgroundColor: colors.surfaceContainerLowest, borderRadius: 16, marginBottom: 10, overflow: "hidden", borderWidth: 1, borderColor: colors.outlineVariant },
  bestBadge: { flexDirection: "row-reverse", alignItems: "center", gap: 4, backgroundColor: colors.primary, paddingHorizontal: 12, paddingVertical: 5, alignSelf: "flex-end" },
  bestBadgeText: { fontFamily: "Cairo_700Bold", fontSize: type.caption.fontSize, color: colors.onPrimary },
  matchRow: { flexDirection: "row-reverse", alignItems: "center", gap: 12, padding: 12 },
  matchLogo: { width: 48, height: 48, borderRadius: 12, backgroundColor: colors.surfaceContainer },
  matchText: { flex: 1 },
  matchName: { fontFamily: "Cairo_700Bold", fontSize: type.body.fontSize, color: colors.onSurface, textAlign: "right" },
  matchMeta: { fontFamily: "Cairo_400Regular", fontSize: type.caption.fontSize, color: colors.outline, textAlign: "right" },
  actions: { gap: 10, marginTop: 8 },
  secondaryBtn: { backgroundColor: colors.surfaceContainer, borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  secondaryBtnText: { fontFamily: "Cairo_700Bold", fontSize: type.label.fontSize, color: colors.onSurface },
  primaryBtn: { backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  primaryBtnText: { fontFamily: "Cairo_700Bold", fontSize: type.label.fontSize, color: colors.onPrimary },
});
