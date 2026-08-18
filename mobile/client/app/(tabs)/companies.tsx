import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import type { ApiCategory, ApiCompany } from "@alassema/core";
import { colors, type } from "@alassema/core";
import Icon from "../../components/Icon";
import Logo from "../../components/Logo";
import { fetchCategories } from "../../lib/categories";
import { fetchCompanies, type CompanySort } from "../../lib/companies";
import { ApiError } from "../../lib/api";

const PAGE_SIZE = 20;

// Matches the website's Companies.tsx SORTS/RATINGS exactly — same values,
// same Arabic copy (see app/src/lib/i18n.ts's ar block).
const SORTS: { key: CompanySort; label: string }[] = [
  { key: "recommended", label: "موصى به" },
  { key: "rating", label: "الأعلى تقييمًا" },
  { key: "projects", label: "الأكثر مشاريع" },
  { key: "reviews", label: "الأكثر تقييمات" },
  { key: "name", label: "الاسم (أ–ي)" },
];

const RATINGS: { value: number; label: string }[] = [
  { value: 0, label: "أي تقييم" },
  { value: 4.5, label: "4.5+" },
  { value: 4.8, label: "4.8+" },
  { value: 5, label: "5.0 فقط" },
];

/**
 * Browse companies and start a request — the entry point the app was missing
 * entirely: without this, a signed-in customer could see requests but had no
 * way to CREATE one, which is the whole point of a lead-gen product.
 *
 * Filters (category/rating) and sort are forwarded to the server, same as the
 * website's catalog — this never filters/sorts client-side. "Available now"
 * is the one exception, same as the website: availability is resolved per-row
 * server-side, not something the list query can filter on, so it narrows
 * whatever page is already on screen instead.
 *
 * Deliberately NOT a full company profile (gallery, offerings catalog,
 * reviews, availability) — that's real scope the website's CompanyProfile.tsx
 * covers and this doesn't yet. This is the minimal real path: search, pick a
 * company, tell them what you need.
 */
export default function Companies() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [minRating, setMinRating] = useState(0);
  const [availableOnly, setAvailableOnly] = useState(false);
  const [sort, setSort] = useState<CompanySort>("recommended");
  const [sortSheetOpen, setSortSheetOpen] = useState(false);

  const [categories, setCategories] = useState<ApiCategory[]>([]);
  const [companies, setCompanies] = useState<ApiCompany[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchCategories().then(setCategories).catch(() => setCategories([]));
  }, []);

  // Bumped on every load, so a stale response (a filter changed again before
  // the previous request came back) can't clobber newer results.
  const requestId = useRef(0);

  const load = useCallback(
    async (targetPage: number, append: boolean) => {
      const id = ++requestId.current;
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError("");
      try {
        const res = await fetchCompanies(query, {
          category: category === "all" ? undefined : category,
          minRating: minRating > 0 ? minRating : undefined,
          sort,
          page: targetPage,
          pageSize: PAGE_SIZE,
        });
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
    [query, category, minRating, sort],
  );

  // Category/rating/sort chips react immediately — a deliberate tap, not
  // free-text typing.
  useEffect(() => {
    load(1, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, minRating, sort]);

  // Debounced: a search request per keystroke would hit the endpoint on every
  // character typed. 350ms matches the website's SearchInput. Skips its very
  // first run — the category/rating/sort effect above already covers the
  // initial load, so this would otherwise double-fetch on mount.
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

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const canLoadMore = page < pageCount && !loading && !loadingMore;
  function loadMore() {
    if (canLoadMore) load(page + 1, true);
  }

  // Same accepted cost the website documents: `total`/pagination stay bound
  // to the server's count, so this client-side narrowing can legitimately
  // show fewer cards than that count says.
  const visibleList = availableOnly ? companies.filter((c) => !c.busy) : companies;
  const activeFilterCount = (category !== "all" ? 1 : 0) + (minRating > 0 ? 1 : 0) + (availableOnly ? 1 : 0);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.topBar}>
        <View style={styles.topBarStart}>
          <Logo size={28} />
          <Text style={styles.title}>الشركات</Text>
        </View>
        <Pressable onPress={() => router.push("/search")} hitSlop={8}>
          <Icon name="search" size={22} color={colors.onSurface} />
        </Pressable>
      </View>

      <View style={styles.searchRow}>
        <Icon name="search" size={18} color={colors.outline} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="دوّر على شركة أو خدمة"
          placeholderTextColor={colors.outline}
          style={styles.searchInput}
          textAlign="right"
        />
      </View>

      <View style={styles.filterRow}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScroll}
        >
          <FilterChip active={category === "all"} onPress={() => setCategory("all")}>
            الكل
          </FilterChip>
          {categories.map((c) => (
            <FilterChip key={c.slug} active={category === c.slug} onPress={() => setCategory(c.slug)}>
              {c.label}
            </FilterChip>
          ))}
          {RATINGS.map((r) => (
            <FilterChip key={r.value} active={minRating === r.value} onPress={() => setMinRating(r.value)}>
              {r.label}
            </FilterChip>
          ))}
          <FilterChip active={availableOnly} onPress={() => setAvailableOnly((v) => !v)}>
            المتاحين دلوقتي
          </FilterChip>
        </ScrollView>

        <Pressable style={styles.sortBtn} onPress={() => setSortSheetOpen(true)} hitSlop={8}>
          <Icon name="tune" size={18} color={colors.onSurface} />
          {activeFilterCount > 0 && (
            <View style={styles.sortBadge}>
              <Text style={styles.sortBadgeText}>{activeFilterCount}</Text>
            </View>
          )}
        </Pressable>
      </View>

      {error !== "" && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <FlatList
        data={visibleList}
        keyExtractor={(c) => c.id}
        contentContainerStyle={styles.listContent}
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        ListEmptyComponent={
          !loading ? <Text style={styles.empty}>مفيش نتايج</Text> : null
        }
        ListFooterComponent={
          loadingMore ? (
            <ActivityIndicator style={styles.footerSpinner} color={colors.primary} />
          ) : null
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() =>
              router.push({ pathname: "/company/[slug]", params: { slug: item.slug } })
            }
            style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
          >
            <Image source={{ uri: item.logo }} style={styles.logo} />
            <View style={styles.cardText}>
              <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
              <Text style={styles.category} numberOfLines={1}>{item.categoryLabel}</Text>
            </View>
            <Icon name="arrow_back" size={18} color={colors.outline} />
          </Pressable>
        )}
      />

      <Modal
        visible={sortSheetOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setSortSheetOpen(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setSortSheetOpen(false)}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>الترتيب حسب</Text>
            {SORTS.map((s) => (
              <Pressable
                key={s.key}
                style={styles.sheetRow}
                onPress={() => {
                  setSort(s.key);
                  setSortSheetOpen(false);
                }}
              >
                <Text style={styles.sheetRowText}>{s.label}</Text>
                {sort === s.key && <Icon name="check" size={18} color={colors.primary} />}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function FilterChip({
  active,
  onPress,
  children,
}: {
  active: boolean;
  onPress: () => void;
  children: React.ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.filterChip, active && styles.filterChipActive]}
    >
      <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{children}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  topBar: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  topBarStart: { flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  title: {
    fontSize: type.headline.fontSize,
    fontFamily: "Alexandria_700Bold",
    color: colors.onSurface,
    textAlign: "right",
  },
  searchRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 20,
    marginTop: 12,
    marginBottom: 4,
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
  filterRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    marginTop: 8,
    paddingStart: 20,
    gap: 8,
  },
  filterScroll: { flexDirection: "row-reverse", gap: 8, paddingEnd: 20 },
  filterChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, backgroundColor: colors.surfaceContainer },
  filterChipActive: { backgroundColor: colors.primary },
  filterChipText: { fontFamily: "Cairo_700Bold", fontSize: type.caption.fontSize, color: colors.onSurfaceVariant },
  filterChipTextActive: { color: colors.onPrimary },
  sortBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceContainer,
    alignItems: "center",
    justifyContent: "center",
    marginEnd: 20,
  },
  sortBadge: {
    position: "absolute",
    top: -2,
    left: -2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  sortBadgeText: { fontFamily: "Cairo_700Bold", fontSize: 10, color: colors.onPrimary },
  errorBanner: { backgroundColor: colors.errorContainer, marginHorizontal: 20, marginTop: 10, borderRadius: 12, padding: 12 },
  errorText: { fontSize: type.label.fontSize, fontFamily: "Cairo_500Medium", color: colors.onErrorContainer, textAlign: "right" },
  listContent: { padding: 20, gap: 10, flexGrow: 1 },
  empty: { textAlign: "center", color: colors.outline, fontFamily: "Cairo_400Regular", fontSize: type.label.fontSize, paddingTop: 60 },
  footerSpinner: { paddingVertical: 20 },
  card: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
  },
  cardPressed: { opacity: 0.7 },
  logo: { width: 44, height: 44, borderRadius: 10, backgroundColor: colors.surfaceContainer },
  cardText: { flex: 1 },
  name: { fontSize: type.body.fontSize, fontFamily: "Cairo_700Bold", color: colors.onSurface, textAlign: "right" },
  category: { fontSize: type.caption.fontSize, fontFamily: "Cairo_400Regular", color: colors.outline, textAlign: "right" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.surfaceContainerLowest, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingVertical: 8, paddingBottom: 24 },
  sheetTitle: {
    fontFamily: "Cairo_700Bold",
    fontSize: type.body.fontSize,
    color: colors.onSurface,
    textAlign: "right",
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  sheetRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  sheetRowText: { fontFamily: "Cairo_500Medium", fontSize: type.body.fontSize, color: colors.onSurface, textAlign: "right" },
});
