import { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, Stack } from "expo-router";
import type { ApiTransaction, ApiTransactionStatus, ApiTransactionType } from "@alassema/core";
import { colors, type } from "@alassema/core";
import { ApiError, textStart, useRefreshOnFocus } from "@alassema/mobile-shared";
import { fetchTransactions } from "../../../../lib/controlFinance";
import PermissionGate from "../../../../components/PermissionGate";
import TransactionRow from "../../../../components/TransactionRow";
import { ListSkeleton, EmptyCard, ErrorCard } from "../../../../components/ListStates";

const PAGE_SIZE = 30;

const TYPES: { value: ApiTransactionType | undefined; label: string }[] = [
  { value: undefined, label: "الكل" },
  { value: "COMMISSION_INCOME", label: "عمولات" },
  { value: "EXPENSE", label: "مصروفات" },
  { value: "ADJUSTMENT", label: "تسويات" },
];

const STATUSES: { value: ApiTransactionStatus | undefined; label: string }[] = [
  { value: undefined, label: "كل الحالات" },
  { value: "PENDING", label: "معلّقة" },
  { value: "COLLECTED", label: "محصّلة" },
  { value: "DISPUTED", label: "متنازع عليها" },
  { value: "VOID", label: "ملغاة" },
];

export default function Transactions() {
  const [transactions, setTransactions] = useState<ApiTransaction[] | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [type, setType] = useState<ApiTransactionType | undefined>(undefined);
  const [status, setStatus] = useState<ApiTransactionStatus | undefined>(undefined);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (opts: { page: number; append: boolean; silent?: boolean }) => {
      if (!opts.silent) setError(null);
      try {
        const result = await fetchTransactions({ page: opts.page, pageSize: PAGE_SIZE, type, status, search: search || undefined });
        setTransactions((prev) => (opts.append && prev ? [...prev, ...result.data] : result.data));
        setTotal(result.meta.total);
        setPage(opts.page);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "تعذّر تحميل المعاملات. جرّب تاني.");
      } finally {
        setLoading(false);
        setLoadingMore(false);
        setRefreshing(false);
      }
    },
    [type, status, search],
  );

  useEffect(() => {
    setLoading(true);
    void load({ page: 1, append: false });
  }, [type, status, search]); // eslint-disable-line react-hooks/exhaustive-deps

  useRefreshOnFocus(() => void load({ page: 1, append: false, silent: true }));

  function onRefresh() {
    setRefreshing(true);
    void load({ page: 1, append: false, silent: true });
  }

  function onEndReached() {
    if (loadingMore || loading || !transactions) return;
    if (transactions.length >= total) return;
    setLoadingMore(true);
    void load({ page: page + 1, append: true, silent: true });
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "المعاملات المالية" }} />
      <PermissionGate permission="finance:read">
        <SafeAreaView style={styles.container} edges={["top"]}>
          <View style={styles.filterWrap}>
            <TextInput
              style={styles.search}
              value={search}
              onChangeText={setSearch}
              placeholder="بحث بالملاحظة أو اسم الشركة أو رقم الطلب"
              placeholderTextColor={colors.onSurfaceVariant}
              textAlign={textStart === "right" ? "right" : "left"}
            />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              {TYPES.map((t) => (
                <Pressable key={t.label} onPress={() => setType(t.value)} style={[styles.chip, type === t.value && styles.chipActive]}>
                  <Text style={[styles.chipLabel, type === t.value && styles.chipLabelActive]}>{t.label}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              {STATUSES.map((s) => (
                <Pressable key={s.label} onPress={() => setStatus(s.value)} style={[styles.chip, status === s.value && styles.chipActive]}>
                  <Text style={[styles.chipLabel, status === s.value && styles.chipLabelActive]}>{s.label}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
          {loading ? (
            <ListSkeleton />
          ) : error ? (
            <ErrorCard message={error} onRetry={() => load({ page: 1, append: false })} />
          ) : transactions && transactions.length > 0 ? (
            <FlatList
              data={transactions}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.list}
              renderItem={({ item }) => (
                <TransactionRow transaction={item} onPress={() => router.push(`/control/finance/transactions/${item.id}`)} />
              )}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
              onEndReachedThreshold={0.4}
              onEndReached={onEndReached}
            />
          ) : (
            <EmptyCard title="مفيش معاملات مطابقة" />
          )}
        </SafeAreaView>
      </PermissionGate>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  filterWrap: { gap: 10, paddingHorizontal: 16, paddingTop: 12 },
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
  chips: { flexDirection: "row-reverse", gap: 8, paddingBottom: 4 },
  chip: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7, backgroundColor: colors.surfaceContainer },
  chipActive: { backgroundColor: colors.primary },
  chipLabel: { fontSize: type.caption.fontSize, fontFamily: "Cairo_600SemiBold", color: colors.onSurfaceVariant },
  chipLabelActive: { color: colors.onPrimary },
  list: { padding: 16, paddingTop: 12 },
  separator: { height: 10 },
});
