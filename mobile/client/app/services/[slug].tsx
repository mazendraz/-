import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Image } from "expo-image";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import type { ApiCategory, ApiCompany } from "@alassema/core";
import { colors, type } from "@alassema/core";
import Icon from "../../components/Icon";
import MenuButton from "../../components/MenuButton";
import { fetchCategories, recordCategoryView } from "../../lib/categories";
import { fetchCompanies } from "../../lib/companies";
import { ApiError, useRefreshOnFocus, assetUri, rowStart, displayLine } from "@alassema/mobile-shared";
import { useCustomerAuth } from "../../lib/customerAuth";

const PAGE_SIZE = 20;

/** Companies filtered by one category — the mobile counterpart of ServiceCategory.tsx.
 *  Paginated the same way Companies.tsx (phase 4) is — infinite scroll via
 *  onEndReached — instead of the fixed pageSize:50 this used to load once,
 *  which silently truncated any category with more companies than that. */
export default function ServiceCategory() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { customer } = useCustomerAuth();
  const [category, setCategory] = useState<ApiCategory | null>(null);
  // Missing before — the website's ServiceCategory.tsx has a search box
  // scoped to the category (search_category_companies_placeholder).
  const [query, setQuery] = useState("");
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
        const res = await fetchCompanies(query, { category: slug, page: targetPage, pageSize: PAGE_SIZE });
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
    [slug, query],
  );

  useEffect(() => {
    // No dedicated error UI for this one — a failure just leaves the
    // fallback title ("الشركات", see the header below) instead of the real
    // category name, and load()'s own error banner already covers the part
    // of this screen that actually needs data to function.
    fetchCategories()
      .then((all) => setCategory(all.find((c) => c.slug === slug) ?? null))
      .catch(() => {});
    load(1, false);
    // Signed-in only (see recordCategoryView) — a guest's browsing has no
    // account to attach the signal to. Fire-and-forget on every visit, same
    // as the load above; slug changing is what re-triggers this effect.
    if (customer && slug) recordCategoryView(slug);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, customer]);

  // Debounced search, same 350ms as companies.tsx's own query effect — skips
  // its first run so this doesn't double-fetch alongside the effect above.
  const queryMounted = useRef(false);
  useEffect(() => {
    if (!queryMounted.current) {
      queryMounted.current = true;
      return;
    }
    const id = setTimeout(() => load(1, false), 350);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  // Refetch when this screen comes back into view — it stays mounted while a
  // company profile / request form is pushed on top of it, so returning from
  // one would otherwise show the list exactly as it was minutes ago. Same
  // page-1-only guard as companies.tsx: load(1, false) replaces the list, and
  // resetting a deep infinite scroll is worse than a slightly older page.
  useRefreshOnFocus(() => {
    if (page !== 1) return;
    fetchCategories()
      .then((all) => setCategory(all.find((c) => c.slug === slug) ?? null))
      .catch(() => {});
    load(1, false);
  });

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const canLoadMore = page < pageCount && !loading && !loadingMore;
  function loadMore() {
    if (canLoadMore) load(page + 1, true);
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="رجوع" onPress={() => router.back()} hitSlop={12}>
          <Icon name="arrow_forward" size={22} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>{category?.label ?? "الشركات"}</Text>
        {/* Was an empty 22-wide counterweight balancing the back arrow so
            the title stayed centred. The menu is the same width, so nothing
            has moved — the balance box just does something now. */}
        <MenuButton size={22} />
      </View>
      {category?.description ? <Text style={styles.sub}>{category.description}</Text> : null}

      <View style={styles.searchRow}>
        <Icon name="search" size={18} color={colors.outline} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="دوّر على شركة في القسم ده"
          placeholderTextColor={colors.outline}
          style={styles.searchInput}
          textAlign="right"
        />
      </View>

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
            <View>
              <Image source={{ uri: assetUri(item.logo) }} style={styles.logo} />
              {/* Missing before — the website's ServiceCategory.tsx marks
                  verified companies with a badge on the cover photo. */}
              {item.verified && (
                <View style={styles.verifiedBadge}>
                  <Icon name="verified" size={11} color={colors.primary} />
                </View>
              )}
            </View>
            <View style={styles.cardBody}>
              <View style={styles.nameRow}>
                <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
                {item.verified && <Text style={styles.verifiedLabel}>موثّقة</Text>}
              </View>
              <Text style={styles.tagline} numberOfLines={2}>{item.tagline}</Text>
              <View style={styles.metaRow}>
                <Text style={styles.rating}>★ {item.rating.toFixed(1)}</Text>
                <Text style={styles.metaDot}>·</Text>
                <Text style={styles.reviewCount}>{item.reviewCount} تقييم</Text>
              </View>
              {/* Missing before — the website shows up to 4 individual
                  service chips per card, plus a "+N" overflow chip. */}
              {item.services.length > 0 && (
                <View style={styles.chipsRow}>
                  {item.services.slice(0, 3).map((s) => (
                    <View key={s} style={styles.chip}>
                      <Text style={styles.chipText} numberOfLines={1}>{s}</Text>
                    </View>
                  ))}
                  {item.services.length > 3 && (
                    <View style={styles.chip}>
                      <Text style={styles.chipText}>+{item.services.length - 3}</Text>
                    </View>
                  )}
                </View>
              )}
            </View>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: rowStart, alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingBottom: 4 },
  title: { fontFamily: "Alexandria_700Bold", fontSize: type.subhead.fontSize, lineHeight: displayLine(type.subhead.fontSize), color: colors.onSurface, flex: 1, textAlign: "center" },
  sub: { fontFamily: "Cairo_400Regular", fontSize: type.label.fontSize, color: colors.outline, textAlign: "right", paddingHorizontal: 20, marginBottom: 8 },
  searchRow: {
    flexDirection: rowStart,
    alignItems: "center",
    gap: 8,
    marginHorizontal: 20,
    marginBottom: 8,
    backgroundColor: colors.surfaceContainer,
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 10,
    fontFamily: "Cairo_400Regular",
    fontSize: type.body.fontSize,
    color: colors.onSurface,
  },
  errorText: { fontFamily: "Cairo_500Medium", fontSize: type.label.fontSize, color: colors.error, textAlign: "center", marginBottom: 8 },
  list: { padding: 20, gap: 12 },
  card: { flexDirection: rowStart, alignItems: "center", gap: 12, backgroundColor: colors.surfaceContainerLowest, borderRadius: 16, padding: 12, borderWidth: 1, borderColor: colors.outlineVariant },
  logo: { width: 52, height: 52, borderRadius: 12, backgroundColor: colors.surfaceContainer },
  verifiedBadge: {
    position: "absolute",
    bottom: -3,
    left: -3,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.outlineVariant,
  },
  cardBody: { flex: 1, gap: 2 },
  nameRow: { flexDirection: rowStart, alignItems: "center", gap: 6 },
  name: { fontFamily: "Cairo_700Bold", fontSize: type.body.fontSize, color: colors.onSurface, textAlign: "right", flexShrink: 1 },
  verifiedLabel: { fontFamily: "Cairo_700Bold", fontSize: 10, color: colors.primary },
  tagline: { fontFamily: "Cairo_400Regular", fontSize: type.caption.fontSize, color: colors.onSurfaceVariant, textAlign: "right" },
  metaRow: { flexDirection: rowStart, alignItems: "center", gap: 4, marginTop: 2 },
  rating: { fontFamily: "Cairo_700Bold", fontSize: type.caption.fontSize, color: "#f59e0b" },
  metaDot: { color: colors.outline },
  reviewCount: { fontFamily: "Cairo_400Regular", fontSize: type.caption.fontSize, color: colors.outline },
  chipsRow: { flexDirection: rowStart, flexWrap: "wrap", gap: 4, marginTop: 6 },
  chip: { backgroundColor: colors.surfaceContainer, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: colors.outlineVariant },
  chipText: { fontFamily: "Cairo_600SemiBold", fontSize: 10, color: colors.onSurfaceVariant },
  empty: { alignItems: "center", gap: 8, paddingTop: 60 },
  emptyText: { fontFamily: "Cairo_500Medium", fontSize: type.label.fontSize, color: colors.outline },
  footerSpinner: { paddingVertical: 20 },
});
