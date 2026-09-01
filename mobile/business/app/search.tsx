import { useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, Stack } from "expo-router";
import type { ApiSearchCategory, ApiSearchResult } from "@alassema/core";
import { colors, type } from "@alassema/core";
import { ApiError, textStart } from "@alassema/mobile-shared";
import { globalSearch } from "../lib/adminSearch";
import { ErrorCard } from "../components/ListStates";

const CATEGORY_LABEL: Record<ApiSearchCategory, string> = {
  client: "عميل",
  provider: "شركة",
  request: "طلب",
  service: "خدمة",
  transaction: "معاملة مالية",
};

/**
 * `result.path` is a Business Control Center DESKTOP route — not navigable
 * here (see lib/adminSearch.ts's header comment). Only a "request" result
 * carries an id this app actually has a screen for. Every category can also
 * legitimately come back empty depending on the signed-in admin's own
 * desktop-permission grants — see phase-8-admin-core.md's own correction —
 * so an empty result set here is a normal outcome, not a broken search.
 */
function ResultRow({ result }: { result: ApiSearchResult }) {
  const openable = result.category === "request";
  const content = (
    <>
      <View style={styles.rowTop}>
        <Text style={styles.categoryTag}>{CATEGORY_LABEL[result.category]}</Text>
        {openable ? <Text style={styles.openHint}>افتح ›</Text> : null}
      </View>
      <Text style={styles.title} numberOfLines={1}>{result.title}</Text>
      <Text style={styles.subtitle} numberOfLines={1}>{result.subtitle}</Text>
    </>
  );
  if (!openable) return <View style={styles.row}>{content}</View>;
  return (
    <Pressable style={({ pressed }) => [styles.row, pressed && styles.rowPressed]} onPress={() => router.push(`/lead/${result.id}`)}>
      {content}
    </Pressable>
  );
}

export default function GlobalSearch() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<ApiSearchResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runSearch(value: string) {
    setQ(value);
    if (!value.trim()) {
      setResults(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await globalSearch(value.trim());
      setResults(res.results);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "تعذّر البحث. جرّب تاني.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "بحث شامل" }} />
      <SafeAreaView style={styles.container} edges={["bottom"]}>
        <View style={styles.searchWrap}>
          <TextInput
            style={styles.search}
            value={q}
            onChangeText={runSearch}
            placeholder="ابحث عن عميل، شركة، طلب، خدمة أو معاملة"
            placeholderTextColor={colors.onSurfaceVariant}
            textAlign={textStart === "right" ? "right" : "left"}
            autoFocus
          />
        </View>

        {error ? (
          <ErrorCard message={error} onRetry={() => runSearch(q)} />
        ) : !q.trim() ? (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyText}>اكتب لتبدأ البحث</Text>
          </View>
        ) : results && results.length === 0 && !loading ? (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyText}>مفيش نتائج مطابقة</Text>
          </View>
        ) : (
          <FlatList
            data={results ?? []}
            keyExtractor={(item, i) => `${item.category}-${item.id}-${i}`}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => <ResultRow result={item} />}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
          />
        )}
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  searchWrap: { padding: 16, paddingBottom: 8 },
  search: {
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: type.body.fontSize,
    fontFamily: "Cairo_400Regular",
    color: colors.onSurface,
    backgroundColor: colors.surface,
  },
  list: { padding: 16, paddingTop: 4 },
  separator: { height: 10 },
  emptyWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  emptyText: { fontSize: type.body.fontSize, fontFamily: "Cairo_500Medium", color: colors.onSurfaceVariant },
  row: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.outlineVariant, borderRadius: 12, padding: 12, gap: 3 },
  rowPressed: { opacity: 0.7 },
  rowTop: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" },
  categoryTag: { fontSize: type.caption.fontSize, fontFamily: "Cairo_700Bold", color: colors.primary },
  openHint: { fontSize: type.caption.fontSize, fontFamily: "Cairo_600SemiBold", color: colors.outline },
  title: { fontSize: type.body.fontSize, fontFamily: "Cairo_700Bold", color: colors.onSurface, textAlign: textStart },
  subtitle: { fontSize: type.caption.fontSize, fontFamily: "Cairo_400Regular", color: colors.onSurfaceVariant, textAlign: textStart },
});
