import { useEffect, useRef, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Image } from "expo-image";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { colors, type } from "@alassema/core";
import Icon from "../components/Icon";
import {
  addRecentSearch,
  clearRecentSearches,
  getRecentSearches,
  searchRemote,
  type SearchResult,
} from "../lib/search";
import { assetUri } from "../lib/assetUrl";

const TYPE_CHIP: Record<SearchResult["type"], string> = {
  category: "فئة",
  company: "شركة",
  product: "منتج",
  service: "خدمة",
};

/**
 * Unified search — the mobile counterpart of the website's SearchOverlay.
 * A standalone screen (pushed from a search button in every main tab's
 * header) rather than a modal-over-tabs: expo-router's Stack already gives it
 * the same "cover everything, back returns to where you were" behavior a
 * modal overlay provides on the web, with no extra plumbing.
 */
export default function Search() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchFailed, setSearchFailed] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    getRecentSearches().then(setRecent);
    const id = setTimeout(() => inputRef.current?.focus(), 150);
    return () => clearTimeout(id);
  }, []);

  // Debounced, and guarded against a stale response landing after a newer
  // query already replaced it (same pattern as Companies.tsx's filters).
  const requestId = useRef(0);
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setSearching(false);
      setSearchFailed(false);
      return;
    }
    const id = ++requestId.current;
    setSearching(true);
    setSearchFailed(false);
    const timer = setTimeout(() => {
      searchRemote(query)
        .then((r) => {
          if (id === requestId.current) setResults(r);
        })
        .catch(() => {
          // A failed search used to leave `results` at whatever it was
          // before (often []), rendering as an ordinary "no results" —
          // indistinguishable from a genuine zero-match query, and an
          // unhandled promise rejection besides.
          if (id === requestId.current) {
            setResults([]);
            setSearchFailed(true);
          }
        })
        .finally(() => {
          if (id === requestId.current) setSearching(false);
        });
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  function go(to: string, term: string) {
    void addRecentSearch(term);
    router.push(to as never);
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Icon name="search" size={18} color={colors.outline} />
        <TextInput
          ref={inputRef}
          value={query}
          onChangeText={setQuery}
          placeholder="دوّر على شركة أو خدمة"
          placeholderTextColor={colors.outline}
          style={styles.input}
          textAlign="right"
          returnKeyType="search"
        />
        {query !== "" && (
          <Pressable accessibilityRole="button" accessibilityLabel="مسح البحث" onPress={() => setQuery("")} hitSlop={8}>
            <Icon name="close" size={18} color={colors.outline} />
          </Pressable>
        )}
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Text style={styles.cancel}>إلغاء</Text>
        </Pressable>
      </View>

      {query.trim() !== "" ? (
        <FlatList
          data={results}
          keyExtractor={(r) => r.key}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            !searching ? (
              <View style={styles.empty}>
                <Icon name={searchFailed ? "link_off" : "search"} size={40} color={colors.outline} />
                <Text style={styles.emptyTitle}>
                  {searchFailed ? "تعذّر البحث. اتأكد من اتصالك وجرّب تاني." : `لا توجد نتائج لـ «${query.trim()}»`}
                </Text>
                <Pressable style={styles.browseBtn} onPress={() => go("/companies", query.trim())}>
                  <Text style={styles.browseBtnText}>تصفّح كل الشركات</Text>
                </Pressable>
              </View>
            ) : null
          }
          renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              onPress={() => go(item.to, item.label)}
            >
              {item.type === "category" ? (
                <View style={styles.serviceIcon}>
                  <Icon name="grid_view" size={18} color={colors.primary} />
                </View>
              ) : (
                <Image source={{ uri: assetUri(item.image) }} style={styles.rowImage} />
              )}
              <View style={styles.rowText}>
                <Text style={styles.rowLabel} numberOfLines={1}>{item.label}</Text>
                <Text style={styles.rowSub} numberOfLines={1}>{item.sub}</Text>
              </View>
              <View style={styles.typeChip}>
                <Text style={styles.typeChipText}>{TYPE_CHIP[item.type]}</Text>
              </View>
            </Pressable>
          )}
        />
      ) : (
        <View style={styles.emptyState}>
          {recent.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHead}>
                <Text style={styles.sectionTitle}>الأخيرة</Text>
                <Pressable
                  onPress={() => {
                    clearRecentSearches();
                    setRecent([]);
                  }}
                >
                  <Text style={styles.sectionClear}>مسح</Text>
                </Pressable>
              </View>
              <View style={styles.chipWrap}>
                {recent.map((term) => (
                  <Pressable key={term} style={styles.recentChip} onPress={() => setQuery(term)}>
                    <Icon name="history" size={14} color={colors.outline} />
                    <Text style={styles.recentChipText}>{term}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>روابط سريعة</Text>
            <Pressable style={styles.quickLinkWide} onPress={() => router.push("/guided-start")}>
              <Icon name="check_circle" size={20} color={colors.primary} />
              <View style={styles.rowText}>
                <Text style={styles.quickLinkTitle}>مش عارف تختار مين؟</Text>
                <Text style={styles.rowSub}>جاوب على سؤالين ونرشّحلك أفضل شركة</Text>
              </View>
            </Pressable>
            <View style={styles.quickLinkRow}>
              <Pressable style={styles.quickLinkHalf} onPress={() => router.push("/services")}>
                <Icon name="grid_view" size={18} color={colors.primary} />
                <Text style={styles.quickLinkHalfText}>كل الخدمات</Text>
              </Pressable>
              <Pressable style={styles.quickLinkHalf} onPress={() => router.push("/companies")}>
                <Icon name="check_circle" size={18} color={colors.primary} />
                <Text style={styles.quickLinkHalfText}>كل الشركات</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.outlineVariant,
  },
  input: {
    flex: 1,
    fontFamily: "Cairo_400Regular",
    fontSize: type.body.fontSize,
    color: colors.onSurface,
  },
  cancel: { fontFamily: "Cairo_700Bold", fontSize: type.label.fontSize, color: colors.primary },
  listContent: { padding: 16, gap: 8, flexGrow: 1 },
  row: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: 14,
    padding: 10,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
  },
  rowPressed: { opacity: 0.7 },
  rowImage: { width: 40, height: 40, borderRadius: 10, backgroundColor: colors.surfaceContainer },
  serviceIcon: { width: 40, height: 40, borderRadius: 10, backgroundColor: colors.primaryContainer, alignItems: "center", justifyContent: "center" },
  rowText: { flex: 1, gap: 2 },
  rowLabel: { fontFamily: "Cairo_700Bold", fontSize: type.label.fontSize, color: colors.onSurface, textAlign: "right" },
  rowSub: { fontFamily: "Cairo_400Regular", fontSize: type.caption.fontSize, color: colors.outline, textAlign: "right" },
  typeChip: { backgroundColor: colors.surfaceContainer, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  typeChipText: { fontFamily: "Cairo_700Bold", fontSize: 10, color: colors.outline },
  empty: { alignItems: "center", gap: 10, paddingTop: 60 },
  emptyTitle: { fontFamily: "Cairo_700Bold", fontSize: type.label.fontSize, color: colors.onSurface, textAlign: "center" },
  browseBtn: { backgroundColor: colors.primary, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 10, marginTop: 4 },
  browseBtnText: { fontFamily: "Cairo_700Bold", fontSize: type.label.fontSize, color: colors.onPrimary },
  emptyState: { padding: 16, gap: 24 },
  section: { gap: 10 },
  sectionHead: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" },
  sectionTitle: { fontFamily: "Cairo_700Bold", fontSize: type.caption.fontSize, color: colors.outline },
  sectionClear: { fontFamily: "Cairo_600SemiBold", fontSize: type.caption.fontSize, color: colors.outline },
  chipWrap: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8 },
  recentChip: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.surfaceContainer,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  recentChipText: { fontFamily: "Cairo_600SemiBold", fontSize: type.label.fontSize, color: colors.onSurfaceVariant },
  quickLinkWide: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
  },
  quickLinkTitle: { fontFamily: "Cairo_700Bold", fontSize: type.label.fontSize, color: colors.onSurface, textAlign: "right" },
  quickLinkRow: { flexDirection: "row-reverse", gap: 8 },
  quickLinkHalf: {
    flex: 1,
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.surfaceContainer,
    borderRadius: 12,
    padding: 12,
  },
  quickLinkHalfText: { fontFamily: "Cairo_700Bold", fontSize: type.label.fontSize, color: colors.onSurface },
});
