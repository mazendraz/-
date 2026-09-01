import { useCallback, useEffect, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import type { ApiConversation } from "@alassema/core";
import { colors, type } from "@alassema/core";
import { ApiError, textStart, useLiveEvents, useRefreshOnFocus } from "@alassema/mobile-shared";
import { fetchAdminThreads } from "../../lib/adminChat";
import ThreadRow from "../../components/ThreadRow";
import { ListSkeleton, EmptyCard, ErrorCard } from "../../components/ListStates";

const PAGE_SIZE = 20;

export default function AdminMessages() {
  const [threads, setThreads] = useState<ApiConversation[] | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (opts: { page: number; append: boolean; silent?: boolean }) => {
      if (!opts.silent) setError(null);
      try {
        const result = await fetchAdminThreads({ page: opts.page, pageSize: PAGE_SIZE, q: q || undefined });
        setThreads((prev) => (opts.append && prev ? [...prev, ...result.data] : result.data));
        setTotal(result.meta.total);
        setPage(opts.page);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "تعذّر تحميل الرسائل. جرّب تاني.");
      } finally {
        setLoading(false);
        setLoadingMore(false);
        setRefreshing(false);
      }
    },
    [q],
  );

  useEffect(() => {
    setLoading(true);
    void load({ page: 1, append: false });
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  useRefreshOnFocus(() => void load({ page: 1, append: false, silent: true }));

  useLiveEvents((event) => {
    if (event.type === "message") void load({ page: 1, append: false, silent: true });
  });

  function onRefresh() {
    setRefreshing(true);
    void load({ page: 1, append: false, silent: true });
  }

  function onEndReached() {
    if (loadingMore || loading || !threads) return;
    if (threads.length >= total) return;
    setLoadingMore(true);
    void load({ page: page + 1, append: true, silent: true });
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.searchWrap}>
        <TextInput
          style={styles.search}
          value={q}
          onChangeText={setQ}
          placeholder="بحث برقم الطلب أو اسم العميل أو الشركة"
          placeholderTextColor={colors.onSurfaceVariant}
          textAlign={textStart === "right" ? "right" : "left"}
        />
      </View>

      {loading ? (
        <ListSkeleton />
      ) : error ? (
        <ErrorCard message={error} onRetry={() => load({ page: 1, append: false })} />
      ) : threads && threads.length > 0 ? (
        <FlatList
          data={threads}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <ThreadRow thread={item} onPress={() => router.push(`/chat/${item.id}`)} />
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          onEndReachedThreshold={0.4}
          onEndReached={onEndReached}
        />
      ) : (
        <EmptyCard title={q ? "مفيش محادثات مطابقة" : "لسه مفيش محادثات"} message={q ? "جرّب بحث تاني." : undefined} />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  searchWrap: { paddingHorizontal: 16, paddingTop: 12 },
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
  list: { padding: 16, paddingTop: 12 },
  separator: { height: 10 },
});
