import { useCallback, useEffect, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import type { ApiConversation } from "@alassema/core";
import { ApiError, useLiveEvents, useRefreshOnFocus } from "@alassema/mobile-shared";
import { fetchThreads } from "../../lib/chat";
import { useStaffAuth } from "../../lib/staffAuth";
import { hasCompany } from "../../lib/permissions";
import ThreadRow from "../../components/ThreadRow";
import ScreenHeader from "../../components/ScreenHeader";
import { ListSkeleton, EmptyCard, ErrorCard } from "../../components/ListStates";

const PAGE_SIZE = 20;

export default function ProviderMessages() {
  const { user } = useStaffAuth();
  const [threads, setThreads] = useState<ApiConversation[] | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (opts: { page: number; append: boolean; silent?: boolean }) => {
    if (!opts.silent) setError(null);
    try {
      const result = await fetchThreads({ page: opts.page, pageSize: PAGE_SIZE });
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
  }, []);

  useEffect(() => {
    if (hasCompany(user)) void load({ page: 1, append: false });
    else setLoading(false);
  }, [load, user]);

  useRefreshOnFocus(() => {
    if (hasCompany(user)) void load({ page: 1, append: false, silent: true });
  });

  // A `message` event means SOME thread's preview/unread-count changed —
  // refetch page 1 to pick it up. See docs/architecture/business-app/
  // phase-5-provider-chat.md's event table.
  useLiveEvents((event) => {
    if (event.type === "message" && hasCompany(user)) {
      void load({ page: 1, append: false, silent: true });
    }
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
      <ScreenHeader title="الرسائل" />

      {!hasCompany(user) ? (
        <EmptyCard
          title="حسابك لسه مش مربوط بشركة"
          message="كلّم الأدمن عشان يربط حسابك بشركتك — بعدها هتلاقي محادثاتك هنا."
        />
      ) : loading ? (
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
        <EmptyCard title="لسه مفيش رسائل" message="أول رسالة من عميل هتظهر هنا." />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { padding: 16, paddingTop: 12 },
  separator: { height: 10 },
});
