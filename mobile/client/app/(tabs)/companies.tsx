import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Image } from "expo-image";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import type { ApiCategory, ApiCompany } from "@alassema/core";
import { colors, type } from "@alassema/core";
import Icon from "../../components/Icon";
import Logo from "../../components/Logo";
import { fetchCategories } from "../../lib/categories";
import { fetchCompanies, type CompanySort } from "../../lib/companies";
import { ApiError } from "../../lib/api";
import { useRefreshOnFocus } from "../../lib/useRefreshOnFocus";
import { assetUri, firstAssetUri } from "../../lib/assetUrl";

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
  const [filtersOpen, setFiltersOpen] = useState(false);

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

  // Coming back to this tab re-reads the catalog, so an edit made on the
  // website (a new company, a renamed category, a company deactivated) shows
  // up without force-closing the app — this tab stays mounted for the whole
  // session, so the mount effects above would otherwise never run again.
  //
  // Deliberately skipped once the customer has paged past the first page:
  // load(1, false) REPLACES the list, so refreshing a 60-item infinite scroll
  // would silently throw away everything below the fold and drop them back to
  // the top. Whatever they do next (a filter tap, a search) refetches anyway.
  useRefreshOnFocus(() => {
    if (page !== 1) return;
    fetchCategories().then(setCategories).catch(() => {});
    load(1, false);
  });

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
  // Falls back to the slug: the chip must never render as an empty pill if
  // the category list hasn't come back yet (or lost that slug).
  const categoryLabel = categories.find((c) => c.slug === category)?.label ?? category;
  const ratingLabel = RATINGS.find((r) => r.value === minRating)?.label ?? "";

  function clearAll() {
    setQuery("");
    setCategory("all");
    setMinRating(0);
    setAvailableOnly(false);
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.topBar}>
        <View style={styles.topBarStart}>
          <Logo size={28} />
          <Text style={styles.title}>الشركات</Text>
        </View>
        <View style={styles.topBarActions}>
          {/* المفضلة lost its tab slot in the five-tab redesign (see
              (tabs)/_layout.tsx). This is its primary door: this screen is
              where a company gets saved, so it is where people come back to
              look for what they saved. */}
          <Pressable accessibilityRole="button" accessibilityLabel="المفضلة" onPress={() => router.push("/saved")} hitSlop={8}>
            <Icon name="favorite" size={22} color={colors.onSurface} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="بحث" onPress={() => router.push("/search")} hitSlop={8}>
            <Icon name="search" size={22} color={colors.onSurface} />
          </Pressable>
        </View>
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

      {/* One box that opens every filter, instead of the long horizontal chip
          scroll this used to be: rating and availability sat off the edge of
          the screen where nobody scrolls, and every new service category
          pushed them further out of sight. The bar now carries only what is
          actually ACTIVE — a fixed, short row no matter how many categories
          the catalog grows to. */}
      <View style={styles.filterRow}>
        <Pressable
          style={styles.filterBtn}
          onPress={() => setFiltersOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="الفلاتر والترتيب"
        >
          <Icon name="tune" size={18} color={colors.onSurface} />
          <Text style={styles.filterBtnText}>الفلاتر والترتيب</Text>
          {activeFilterCount > 0 ? (
            <View style={styles.filterBtnBadge}>
              <Text style={styles.filterBtnBadgeText}>{activeFilterCount}</Text>
            </View>
          ) : null}
          <View style={styles.filterBtnGrow} />
          <Icon name="expand_more" size={18} color={colors.outline} />
        </Pressable>
      </View>

      {activeFilterCount > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.activeRow}
          contentContainerStyle={styles.activeScroll}
        >
          {category !== "all" ? (
            <ActiveChip label={categoryLabel} onRemove={() => setCategory("all")} />
          ) : null}
          {minRating > 0 ? (
            <ActiveChip label={ratingLabel} onRemove={() => setMinRating(0)} />
          ) : null}
          {availableOnly ? (
            <ActiveChip label="المتاحين دلوقتي" onRemove={() => setAvailableOnly(false)} />
          ) : null}
        </ScrollView>
      ) : null}

      {/* Missing before — the website shows a result count and a one-tap
          "clear all filters" once any filter/search is active
          (companies_remove_filter / common_clear_all). */}
      {!loading && (
        <View style={styles.resultsRow}>
          <Text style={styles.resultsText}>{total} شركة</Text>
          {(query.trim() || activeFilterCount > 0) && (
            <Pressable onPress={clearAll}>
              <Text style={styles.clearAllText}>امسح كل الفلاتر</Text>
            </Pressable>
          )}
        </View>
      )}

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
            {/* Cover + badges — the website's own card leads with a cover
                photo and verified/busy badges; this list used to skip
                straight to a small logo + two lines of text. */}
            <View style={styles.coverWrap}>
              <Image source={{ uri: firstAssetUri(item.cover, item.logo) }} style={styles.cover} />
              <View style={styles.coverLogoWrap}>
                <Image source={{ uri: assetUri(item.logo) }} style={styles.coverLogo} />
              </View>
              {item.verified ? (
                <View style={styles.verifiedBadge}>
                  <Icon name="verified" size={11} color={colors.primary} />
                  <Text style={styles.verifiedBadgeText}>موثّقة</Text>
                </View>
              ) : null}
              {item.busy ? (
                <View style={styles.busyBadge}>
                  <Icon name="event_busy" size={11} color="#fff" />
                  <Text style={styles.busyBadgeText}>مشغولة</Text>
                </View>
              ) : null}
            </View>
            <View style={styles.cardBody}>
              <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
              <Text style={styles.category} numberOfLines={1}>{item.categoryLabel}</Text>
              <View style={styles.ratingRow}>
                <Text style={styles.ratingStar}>★</Text>
                <Text style={styles.ratingText}>{item.rating.toFixed(1)}</Text>
                <Text style={styles.reviewCount}>({item.reviewCount})</Text>
              </View>
              {item.tagline ? (
                <Text style={styles.tagline} numberOfLines={2}>{item.tagline}</Text>
              ) : null}
              <View style={styles.cardFooter}>
                <Text style={styles.projectsText}>{item.completedProjects} مشروع</Text>
                <View style={styles.viewRow}>
                  <Text style={styles.viewText}>عرض</Text>
                  <Icon name="arrow_back" size={12} color={colors.primary} />
                </View>
              </View>
            </View>
          </Pressable>
        )}
      />

      {/* Every filter in one sheet — category (wrapped, so a growing catalog
          adds rows instead of pushing options off-screen), rating,
          availability and sort. Choices apply live behind the sheet; the
          footer button just closes it and reads back the count. */}
      <Modal
        visible={filtersOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setFiltersOpen(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setFiltersOpen(false)}>
          {/* Swallows taps inside the sheet so they don't reach the backdrop's
              dismiss handler underneath. */}
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>الفلاتر والترتيب</Text>
              <Pressable
                onPress={() => setFiltersOpen(false)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="إغلاق"
              >
                <Icon name="close" size={20} color={colors.onSurfaceVariant} />
              </Pressable>
            </View>

            <ScrollView style={styles.sheetScroll} contentContainerStyle={styles.sheetScrollContent}>
              <Text style={styles.sheetSection}>الفئة</Text>
              <View style={styles.chipWrap}>
                <FilterChip active={category === "all"} onPress={() => setCategory("all")}>
                  الكل
                </FilterChip>
                {categories.map((c) => (
                  <FilterChip key={c.slug} active={category === c.slug} onPress={() => setCategory(c.slug)}>
                    {c.label}
                  </FilterChip>
                ))}
              </View>

              <Text style={styles.sheetSection}>التقييم</Text>
              <View style={styles.chipWrap}>
                {RATINGS.map((r) => (
                  <FilterChip key={r.value} active={minRating === r.value} onPress={() => setMinRating(r.value)}>
                    {r.label}
                  </FilterChip>
                ))}
              </View>

              <Text style={styles.sheetSection}>التوفّر</Text>
              <View style={styles.chipWrap}>
                <FilterChip active={availableOnly} onPress={() => setAvailableOnly((v) => !v)}>
                  المتاحين دلوقتي
                </FilterChip>
              </View>

              <Text style={styles.sheetSection}>الترتيب حسب</Text>
              {SORTS.map((s) => (
                <Pressable key={s.key} style={styles.sheetRow} onPress={() => setSort(s.key)}>
                  <Text style={styles.sheetRowText}>{s.label}</Text>
                  {sort === s.key && <Icon name="check" size={18} color={colors.primary} />}
                </Pressable>
              ))}
            </ScrollView>

            <View style={styles.sheetFooter}>
              <Pressable
                style={styles.sheetClear}
                onPress={clearAll}
                accessibilityRole="button"
              >
                <Text style={styles.sheetClearText}>مسح الكل</Text>
              </Pressable>
              <Pressable
                style={styles.sheetApply}
                onPress={() => setFiltersOpen(false)}
                accessibilityRole="button"
              >
                <Text style={styles.sheetApplyText}>عرض {total} شركة</Text>
              </Pressable>
            </View>
          </Pressable>
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

/** A filter that IS applied, shown on the bar with a one-tap way off. */
function ActiveChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <Pressable
      style={styles.activeChip}
      onPress={onRemove}
      accessibilityRole="button"
      accessibilityLabel={`شيل فلتر ${label}`}
    >
      <Text style={styles.activeChipText}>{label}</Text>
      <Icon name="close" size={13} color={colors.onPrimary} />
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
  topBarActions: { flexDirection: "row-reverse", alignItems: "center", gap: 18 },
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
  filterRow: { marginTop: 8, paddingHorizontal: 20 },
  filterBtn: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.surfaceContainer,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  filterBtnText: { fontFamily: "Cairo_700Bold", fontSize: type.label.fontSize, color: colors.onSurface },
  filterBtnGrow: { flex: 1 },
  filterBtnBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  filterBtnBadgeText: { fontFamily: "Cairo_700Bold", fontSize: 10, color: colors.onPrimary },
  activeRow: { flexGrow: 0, marginTop: 8 },
  activeScroll: { flexDirection: "row-reverse", gap: 8, paddingHorizontal: 20 },
  activeChip: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 5,
    backgroundColor: colors.primary,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  activeChipText: { fontFamily: "Cairo_700Bold", fontSize: type.caption.fontSize, color: colors.onPrimary },
  filterChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: colors.surfaceContainer },
  filterChipActive: { backgroundColor: colors.primary },
  filterChipText: { fontFamily: "Cairo_700Bold", fontSize: type.caption.fontSize, color: colors.onSurfaceVariant },
  filterChipTextActive: { color: colors.onPrimary },
  errorBanner: { backgroundColor: colors.errorContainer, marginHorizontal: 20, marginTop: 10, borderRadius: 12, padding: 12 },
  errorText: { fontSize: type.label.fontSize, fontFamily: "Cairo_500Medium", color: colors.onErrorContainer, textAlign: "right" },
  resultsRow: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  resultsText: { fontFamily: "Cairo_700Bold", fontSize: type.caption.fontSize, color: colors.outline },
  clearAllText: { fontFamily: "Cairo_700Bold", fontSize: type.caption.fontSize, color: colors.primary },
  listContent: { padding: 20, gap: 10, flexGrow: 1 },
  empty: { textAlign: "center", color: colors.outline, fontFamily: "Cairo_400Regular", fontSize: type.label.fontSize, paddingTop: 60 },
  footerSpinner: { paddingVertical: 20 },
  card: {
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.outlineVariant,
  },
  cardPressed: { opacity: 0.85 },
  coverWrap: { height: 130, backgroundColor: colors.surfaceContainer },
  cover: { width: "100%", height: "100%" },
  coverLogoWrap: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 40,
    height: 40,
    borderRadius: 10,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "#fff",
    backgroundColor: "#fff",
  },
  coverLogo: { width: "100%", height: "100%" },
  verifiedBadge: {
    position: "absolute",
    top: 10,
    left: 10,
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 3,
    backgroundColor: "rgba(255,255,255,0.92)",
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  verifiedBadgeText: { fontFamily: "Cairo_700Bold", fontSize: 10, color: colors.primary },
  busyBadge: {
    position: "absolute",
    bottom: 10,
    right: 10,
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 3,
    backgroundColor: "#d97706",
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  busyBadgeText: { fontFamily: "Cairo_700Bold", fontSize: 10, color: "#fff" },
  cardBody: { padding: 12, gap: 2 },
  name: { fontSize: type.body.fontSize, fontFamily: "Cairo_700Bold", color: colors.onSurface, textAlign: "right" },
  category: { fontSize: type.caption.fontSize, fontFamily: "Cairo_400Regular", color: colors.outline, textAlign: "right" },
  ratingRow: { flexDirection: "row-reverse", alignItems: "center", gap: 3, marginTop: 3 },
  ratingStar: { fontSize: type.caption.fontSize, color: "#f59e0b" },
  ratingText: { fontSize: type.caption.fontSize, fontFamily: "Cairo_700Bold", color: colors.onSurface },
  reviewCount: { fontSize: type.caption.fontSize, fontFamily: "Cairo_400Regular", color: colors.outline },
  tagline: { fontSize: type.caption.fontSize, fontFamily: "Cairo_400Regular", color: colors.onSurfaceVariant, textAlign: "right", marginTop: 4, lineHeight: 17 },
  cardFooter: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.outlineVariant,
  },
  projectsText: { fontSize: type.caption.fontSize, fontFamily: "Cairo_400Regular", color: colors.outline },
  viewRow: { flexDirection: "row-reverse", alignItems: "center", gap: 3 },
  viewText: { fontSize: type.caption.fontSize, fontFamily: "Cairo_700Bold", color: colors.primary },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.surfaceContainerLowest,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 8,
    paddingBottom: 24,
    // Caps the sheet at most of the screen so a long category list scrolls
    // inside it instead of pushing the footer button off the bottom.
    maxHeight: "85%",
  },
  sheetHandle: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.outlineVariant,
    marginBottom: 4,
  },
  sheetHeader: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  sheetTitle: {
    fontFamily: "Cairo_700Bold",
    fontSize: type.body.fontSize,
    color: colors.onSurface,
    textAlign: "right",
  },
  sheetScroll: { flexGrow: 0 },
  sheetScrollContent: { paddingBottom: 12 },
  sheetSection: {
    fontFamily: "Cairo_700Bold",
    fontSize: type.caption.fontSize,
    color: colors.outline,
    textAlign: "right",
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 8,
  },
  chipWrap: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8, paddingHorizontal: 20 },
  sheetFooter: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.outlineVariant,
  },
  sheetApply: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  sheetApplyText: { fontFamily: "Cairo_700Bold", fontSize: type.label.fontSize, color: colors.onPrimary },
  sheetClear: { paddingVertical: 12, paddingHorizontal: 6 },
  sheetClearText: { fontFamily: "Cairo_700Bold", fontSize: type.label.fontSize, color: colors.primary },
  sheetRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  sheetRowText: { fontFamily: "Cairo_500Medium", fontSize: type.body.fontSize, color: colors.onSurface, textAlign: "right" },
});
