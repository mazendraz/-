import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import type { ApiCategory, ApiCompany } from "@alassema/core";
import { colors, type } from "@alassema/core";
import Icon from "../../components/Icon";
import { fetchCategories } from "../../lib/categories";
import { fetchCompanies } from "../../lib/companies";
import { ApiError } from "../../lib/api";

const PAGE_SIZE = 20;

/** Companies filtered by one category — the mobile counterpart of ServiceCategory.tsx.
 *  Paginated the same way Companies.tsx (phase 4) is — infinite scroll via
 *  onEndReached — instead of the fixed pageSize:50 this used to load once,
 *  which silently truncated any category with more companies than that. */
export default function ServiceCategory() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const [category, setCategory] = useState<ApiCategory | null>(null);
  const [companies, setCompanies] = useState<ApiCompany[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");

  const requestId = useRef(0);

  const load = useCallback(
    async (targetPage: number, append: boolean) => {
      const id = ++requestId.current;
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError("");
      try {
        const res = await fetchCompanies(undefined, { category: slug, page: targetPage, pageSize: PAGE_SIZE });
        if (id !== requestId.current) return;
        setCompanies((prev) => (append ? [...prev, ...res.data] : res.data));
        setTotal(res.meta.total);
        setPage(res.meta.page);
      } catch (err) {
        if (id !== requestId.current) return;
        setError(err instanceof ApiError ? err.message : "تعذّر تحميل الشركات.");
      } finally {
        if (id === requestId.current) {
          if (append) setLoadingMore(false);
          else setLoading(false);
        }
      }
    },
    [slug],
  );

  useEffect(() => {
    fetchCategories().then((all) => setCategory(all.find((c) => c.slug === slug) ?? null));
    load(1, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const canLoadMore = page < pageCount && !loading && !loadingMore;
  function loadMore() {
    if (canLoadMore) load(page + 1, true);
  }

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
        data={companies}
        keyExtractor={(c) => c.id}
        contentContainerStyle={styles.list}
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.empty}>
              <Icon name="search" size={36} color={colors.outline} />
              <Text style={styles.emptyText}>مفيش شركات في القسم ده لسه</Text>
            </View>
          ) : null
        }
        ListFooterComponent={
          loadingMore ? <ActivityIndicator style={styles.footerSpinner} color={colors.primary} /> : null
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
  footerSpinner: { paddingVertical: 20 },
});
