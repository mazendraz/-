import { useCallback, useEffect, useState } from "react";
import { FlatList, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack } from "expo-router";
import type { ApiWaitlistEntry } from "@alassema/core";
import { colors, type } from "@alassema/core";
import { ApiError, textStart, useRefreshOnFocus } from "@alassema/mobile-shared";
import { fetchPlatformWaitlist } from "../lib/adminWaitlist";
import { ListSkeleton, EmptyCard, ErrorCard } from "../components/ListStates";

const PAGE_SIZE = 30;

const STATUS_LABEL: Record<ApiWaitlistEntry["status"], string> = {
  WAITING: "منتظر",
  NOTIFIED: "اتبلّغ",
  CONVERTED: "اتحوّل لطلب",
  CANCELLED: "ملغي",
};

function EntryRow({ entry }: { entry: ApiWaitlistEntry }) {
  return (
    <View style={styles.row}>
      <View style={styles.top}>
        <Text style={styles.name} numberOfLines={1}>{entry.name}</Text>
        <Text style={styles.status}>{STATUS_LABEL[entry.status]}</Text>
      </View>
      <Text style={styles.meta}>{entry.companyName} · {entry.service ?? "—"}</Text>
      <Text style={styles.phone}>{entry.phone}</Text>
    </View>
  );
}

/** Read-only, platform-wide — see phase-10's own scope for the per-company
 *  screen at company/[id]/waitlist.tsx (also read-only, same reasoning). */
export default function PlatformWaitlist() {
  const [entries, setEntries] = useState<ApiWaitlistEntry[] | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (opts: { page: number; append: boolean }) => {
      try {
        const result = await fetchPlatformWaitlist({ page: opts.page, pageSize: PAGE_SIZE, search: search || undefined });
        setEntries((prev) => (opts.append && prev ? [...prev, ...result.data] : result.data));
        setTotal(result.meta.total);
        setPage(opts.page);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "تعذّر تحميل قائمة الانتظار. جرّب تاني.");
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [search],
  );

  useEffect(() => {
    setLoading(true);
    setError(null);
    void load({ page: 1, append: false });
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  useRefreshOnFocus(() => void load({ page: 1, append: false }));

  function onEndReached() {
    if (loadingMore || loading || !entries) return;
    if (entries.length >= total) return;
    setLoadingMore(true);
    void load({ page: page + 1, append: true });
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "قائمة الانتظار (كل الشركات)" }} />
      <SafeAreaView style={styles.container} edges={["bottom"]}>
        <View style={styles.searchWrap}>
          <TextInput
            style={styles.search}
            value={search}
            onChangeText={setSearch}
            placeholder="بحث بالاسم أو الهاتف"
            placeholderTextColor={colors.onSurfaceVariant}
            textAlign={textStart === "right" ? "right" : "left"}
          />
        </View>
        {loading ? (
          <ListSkeleton />
        ) : error ? (
          <ErrorCard message={error} onRetry={() => load({ page: 1, append: false })} />
        ) : entries && entries.length > 0 ? (
          <FlatList
            data={entries}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => <EntryRow entry={item} />}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            onEndReachedThreshold={0.4}
            onEndReached={onEndReached}
          />
        ) : (
          <EmptyCard title={search ? "مفيش نتائج مطابقة" : "لسه مفيش حد في قائمة الانتظار"} />
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
    paddingVertical: 10,
    fontSize: type.body.fontSize,
    fontFamily: "Cairo_400Regular",
    color: colors.onSurface,
    backgroundColor: colors.surface,
  },
  list: { padding: 16, paddingTop: 4 },
  separator: { height: 10 },
  row: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.outlineVariant, borderRadius: 14, padding: 14, gap: 4 },
  top: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", gap: 8 },
  name: { flex: 1, fontSize: type.body.fontSize, fontFamily: "Cairo_700Bold", color: colors.onSurface, textAlign: textStart },
  status: { fontSize: type.caption.fontSize, fontFamily: "Cairo_700Bold", color: colors.primary },
  meta: { fontSize: type.caption.fontSize, fontFamily: "Cairo_500Medium", color: colors.onSurfaceVariant, textAlign: textStart },
  phone: { fontSize: type.caption.fontSize, fontFamily: "Cairo_400Regular", color: colors.outline, textAlign: textStart },
});
