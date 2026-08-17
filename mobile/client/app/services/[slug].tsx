import { useEffect, useState } from "react";
import { FlatList, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import type { ApiCategory, ApiCompany } from "@alassema/core";
import { colors, type } from "@alassema/core";
import Icon from "../../components/Icon";
import { fetchCategories } from "../../lib/categories";
import { fetchCompanies } from "../../lib/companies";
import { ApiError } from "../../lib/api";

/** Companies filtered by one category — the mobile counterpart of ServiceCategory.tsx. */
export default function ServiceCategory() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const [category, setCategory] = useState<ApiCategory | null>(null);
  const [companies, setCompanies] = useState<ApiCompany[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchCategories().then((all) => setCategory(all.find((c) => c.slug === slug) ?? null));
    fetchCompanies(undefined, { category: slug, pageSize: 50 })
      .then((page) => setCompanies(page.data))
      .catch((err) => setError(err instanceof ApiError ? err.message : "تعذّر تحميل الشركات."));
  }, [slug]);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Icon name="arrow_back" size={22} color={colors.onSurface} style={{ transform: [{ scaleX: -1 }] }} />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>{category?.label ?? "الشركات"}</Text>
        <View style={{ width: 22 }} />
      </View>
      {category?.description ? <Text style={styles.sub}>{category.description}</Text> : null}

      {error !== "" && <Text style={styles.errorText}>{error}</Text>}

      <FlatList
        data={companies ?? []}
        keyExtractor={(c) => c.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          companies !== null ? (
            <View style={styles.empty}>
              <Icon name="search" size={36} color={colors.outline} />
              <Text style={styles.emptyText}>مفيش شركات في القسم ده لسه</Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <Pressable
            style={styles.card}
            onPress={() => router.push({ pathname: "/company/[slug]", params: { slug: item.slug } })}
          >
            <Image source={{ uri: item.logo }} style={styles.logo} />
            <View style={styles.cardBody}>
              <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
              <Text style={styles.tagline} numberOfLines={2}>{item.tagline}</Text>
              <View style={styles.metaRow}>
                <Text style={styles.rating}>★ {item.rating.toFixed(1)}</Text>
                <Text style={styles.metaDot}>·</Text>
                <Text style={styles.reviewCount}>{item.reviewCount} تقييم</Text>
              </View>
            </View>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingBottom: 4 },
  title: { fontFamily: "Alexandria_700Bold", fontSize: type.subhead.fontSize, color: colors.onSurface, flex: 1, textAlign: "center" },
  sub: { fontFamily: "Cairo_400Regular", fontSize: type.label.fontSize, color: colors.outline, textAlign: "right", paddingHorizontal: 20, marginBottom: 8 },
  errorText: { fontFamily: "Cairo_500Medium", fontSize: type.label.fontSize, color: colors.error, textAlign: "center", marginBottom: 8 },
  list: { padding: 20, gap: 12 },
  card: { flexDirection: "row-reverse", alignItems: "center", gap: 12, backgroundColor: colors.surfaceContainerLowest, borderRadius: 16, padding: 12, borderWidth: 1, borderColor: colors.outlineVariant },
  logo: { width: 52, height: 52, borderRadius: 12, backgroundColor: colors.surfaceContainer },
  cardBody: { flex: 1, gap: 2 },
  name: { fontFamily: "Cairo_700Bold", fontSize: type.body.fontSize, color: colors.onSurface, textAlign: "right" },
  tagline: { fontFamily: "Cairo_400Regular", fontSize: type.caption.fontSize, color: colors.onSurfaceVariant, textAlign: "right" },
  metaRow: { flexDirection: "row-reverse", alignItems: "center", gap: 4, marginTop: 2 },
  rating: { fontFamily: "Cairo_700Bold", fontSize: type.caption.fontSize, color: "#f59e0b" },
  metaDot: { color: colors.outline },
  reviewCount: { fontFamily: "Cairo_400Regular", fontSize: type.caption.fontSize, color: colors.outline },
  empty: { alignItems: "center", gap: 8, paddingTop: 60 },
  emptyText: { fontFamily: "Cairo_500Medium", fontSize: type.label.fontSize, color: colors.outline },
});
