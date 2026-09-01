import { useCallback, useEffect, useState } from "react";
import { FlatList, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, Stack } from "expo-router";
import { ApiError, useRefreshOnFocus } from "@alassema/mobile-shared";
import type { ApiAdminUser } from "@alassema/core";
import { fetchUsers } from "../../lib/adminTeam";
import Button from "../../components/Button";
import UserRow from "../../components/UserRow";
import { ListSkeleton, EmptyCard, ErrorCard } from "../../components/ListStates";

const PAGE_SIZE = 30;

export default function Team() {
  const [users, setUsers] = useState<ApiAdminUser[] | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (opts: { page: number; append: boolean }) => {
    try {
      const result = await fetchUsers({ page: opts.page, pageSize: PAGE_SIZE });
      setUsers((prev) => (opts.append && prev ? [...prev, ...result.data] : result.data));
      setTotal(result.meta.total);
      setPage(opts.page);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "تعذّر تحميل الفريق. جرّب تاني.");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    void load({ page: 1, append: false });
  }, [load]);

  useRefreshOnFocus(() => void load({ page: 1, append: false }));

  function onEndReached() {
    if (loadingMore || loading || !users) return;
    if (users.length >= total) return;
    setLoadingMore(true);
    void load({ page: page + 1, append: true });
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "الفريق" }} />
      <SafeAreaView style={styles.container} edges={["bottom"]}>
        <View style={styles.addRow}>
          <Button label="+ إضافة عضو" onPress={() => router.push("/team/new")} />
        </View>
        {loading ? (
          <ListSkeleton />
        ) : error ? (
          <ErrorCard message={error} onRetry={() => load({ page: 1, append: false })} />
        ) : users && users.length > 0 ? (
          <FlatList
            data={users}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => <UserRow user={item} onPress={() => router.push(`/team/${item.id}`)} />}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            onEndReachedThreshold={0.4}
            onEndReached={onEndReached}
          />
        ) : (
          <EmptyCard title="لسه مفيش أعضاء" />
        )}
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  addRow: { padding: 16, paddingBottom: 0 },
  list: { padding: 16 },
  separator: { height: 10 },
});
