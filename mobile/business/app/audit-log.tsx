import { useCallback, useEffect, useState } from "react";
import { FlatList, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack } from "expo-router";
import type { ApiAuditLog } from "@alassema/core";
import { colors, type } from "@alassema/core";
import { ApiError, textStart, useRefreshOnFocus } from "@alassema/mobile-shared";
import { fetchAuditLogs } from "../lib/adminAudit";
import { ListSkeleton, EmptyCard, ErrorCard } from "../components/ListStates";

const PAGE_SIZE = 40;

function relativeTime(epochMs: number): string {
  const diffMin = Math.max(0, Math.round((Date.now() - epochMs) / 60_000));
  if (diffMin < 1) return "دلوقتي";
  if (diffMin < 60) return `من ${diffMin} دقيقة`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `من ${diffHr} ساعة`;
  return `من ${Math.round(diffHr / 24)} يوم`;
}

function LogRow({ log }: { log: ApiAuditLog }) {
  return (
    <View style={styles.row}>
      <View style={styles.top}>
        <Text style={styles.action} numberOfLines={1}>{log.action}</Text>
        <Text style={styles.time}>{relativeTime(log.createdAt)}</Text>
      </View>
      <Text style={styles.meta}>{log.actorEmail} · {log.entity}</Text>
      {log.meta ? <Text style={styles.metaJson} numberOfLines={2}>{JSON.stringify(log.meta)}</Text> : null}
    </View>
  );
}

export default function AuditLog() {
  const [logs, setLogs] = useState<ApiAuditLog[] | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [actionFilter, setActionFilter] = useState("");
  const [entityFilter, setEntityFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (opts: { page: number; append: boolean }) => {
      try {
        const result = await fetchAuditLogs({
          page: opts.page, pageSize: PAGE_SIZE,
          action: actionFilter || undefined, entity: entityFilter || undefined,
        });
        setLogs((prev) => (opts.append && prev ? [...prev, ...result.data] : result.data));
        setTotal(result.meta.total);
        setPage(opts.page);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "تعذّر تحميل السجل. جرّب تاني.");
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [actionFilter, entityFilter],
  );

  useEffect(() => {
    setLoading(true);
    setError(null);
    void load({ page: 1, append: false });
  }, [actionFilter, entityFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  useRefreshOnFocus(() => void load({ page: 1, append: false }));

  function onEndReached() {
    if (loadingMore || loading || !logs) return;
    if (logs.length >= total) return;
    setLoadingMore(true);
    void load({ page: page + 1, append: true });
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "سجل الإجراءات" }} />
      <SafeAreaView style={styles.container} edges={["bottom"]}>
        <View style={styles.filterRow}>
          <TextInput
            style={[styles.filterInput, styles.filterInputHalf]}
            value={actionFilter}
            onChangeText={setActionFilter}
            placeholder="فلترة بالإجراء"
            placeholderTextColor={colors.onSurfaceVariant}
          />
          <TextInput
            style={[styles.filterInput, styles.filterInputHalf]}
            value={entityFilter}
            onChangeText={setEntityFilter}
            placeholder="فلترة بالنوع"
            placeholderTextColor={colors.onSurfaceVariant}
          />
        </View>

        {loading ? (
          <ListSkeleton />
        ) : error ? (
          <ErrorCard message={error} onRetry={() => load({ page: 1, append: false })} />
        ) : logs && logs.length > 0 ? (
          <FlatList
            data={logs}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => <LogRow log={item} />}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            onEndReachedThreshold={0.4}
            onEndReached={onEndReached}
          />
        ) : (
          <EmptyCard title="مفيش إجراءات مسجّلة" message={actionFilter || entityFilter ? "جرّب تغيّر الفلتر." : undefined} />
        )}
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  filterRow: { flexDirection: "row-reverse", gap: 8, padding: 16, paddingBottom: 8 },
  filterInput: {
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: type.label.fontSize,
    fontFamily: "Cairo_400Regular",
    color: colors.onSurface,
    backgroundColor: colors.surface,
  },
  filterInputHalf: { flex: 1 },
  list: { padding: 16, paddingTop: 4 },
  separator: { height: 10 },
  row: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.outlineVariant, borderRadius: 12, padding: 12, gap: 3 },
  top: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", gap: 8 },
  action: { flex: 1, fontSize: type.body.fontSize, fontFamily: "Cairo_700Bold", color: colors.onSurface, textAlign: textStart },
  time: { fontSize: type.caption.fontSize, fontFamily: "Cairo_400Regular", color: colors.outline },
  meta: { fontSize: type.caption.fontSize, fontFamily: "Cairo_500Medium", color: colors.onSurfaceVariant, textAlign: textStart },
  metaJson: { fontSize: 11, fontFamily: "Cairo_400Regular", color: colors.outline, textAlign: textStart },
});
