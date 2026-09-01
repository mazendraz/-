import { useCallback, useEffect, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack } from "expo-router";
import type { ApiClient, ApiClientOverview } from "@alassema/core";
import { colors, type } from "@alassema/core";
import { ApiError, textStart, useRefreshOnFocus } from "@alassema/mobile-shared";
import { fetchClientOverview, fetchClients } from "../../lib/controlClients";
import { formatEgp } from "../../lib/money";
import PermissionGate from "../../components/PermissionGate";
import KpiTile from "../../components/KpiTile";
import { ListSkeleton, EmptyCard, ErrorCard } from "../../components/ListStates";

const PAGE_SIZE = 30;

function ClientRow({ client }: { client: ApiClient }) {
  return (
    <View style={styles.row}>
      <View style={styles.rowTop}>
        <Text style={styles.name} numberOfLines={1}>{client.name}</Text>
        <View style={[styles.statusChip, client.status === "ACTIVE" ? styles.statusActive : styles.statusDormant]}>
          <Text style={styles.statusText}>{client.status === "ACTIVE" ? "نشط" : "غير نشط"}</Text>
        </View>
      </View>
      <Text style={styles.phone}>{client.phone}</Text>
      <Text style={styles.meta}>
        {client.totalRequests} طلب · {client.successfulServices} خدمة ناجحة · {formatEgp(client.totalValue)}
      </Text>
    </View>
  );
}

export default function ControlClients() {
  const [overview, setOverview] = useState<ApiClientOverview | null>(null);
  const [clients, setClients] = useState<ApiClient[] | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (opts: { page: number; append: boolean; silent?: boolean }) => {
      if (!opts.silent) setError(null);
      try {
        const [overviewResult, clientsResult] = await Promise.all([
          opts.page === 1 ? fetchClientOverview() : Promise.resolve(overview),
          fetchClients({ page: opts.page, pageSize: PAGE_SIZE, search: search || undefined }),
        ]);
        if (overviewResult) setOverview(overviewResult);
        setClients((prev) => (opts.append && prev ? [...prev, ...clientsResult.data] : clientsResult.data));
        setTotal(clientsResult.meta.total);
        setPage(opts.page);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "تعذّر تحميل العملاء. جرّب تاني.");
      } finally {
        setLoading(false);
        setLoadingMore(false);
        setRefreshing(false);
      }
    },
    [search], // eslint-disable-line react-hooks/exhaustive-deps
  );

  useEffect(() => {
    setLoading(true);
    void load({ page: 1, append: false });
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  useRefreshOnFocus(() => void load({ page: 1, append: false, silent: true }));

  function onRefresh() {
    setRefreshing(true);
    void load({ page: 1, append: false, silent: true });
  }

  function onEndReached() {
    if (loadingMore || loading || !clients) return;
    if (clients.length >= total) return;
    setLoadingMore(true);
    void load({ page: page + 1, append: true, silent: true });
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "العملاء" }} />
      <PermissionGate permission={["business:read", "analytics:read"]}>
        <SafeAreaView style={styles.container} edges={["top"]}>
          {overview ? (
            <View style={styles.kpiGrid}>
              <View style={styles.kpiRow}>
                <KpiTile label="إجمالي العملاء" value={overview.totalClients} />
                <KpiTile label="نسبة الاحتفاظ" value={`${overview.retentionRatePercent}%`} />
              </View>
              <View style={styles.kpiRow}>
                <KpiTile label="متوسط قيمة العميل" value={formatEgp(overview.avgLifetimeValue)} />
                <KpiTile label="عملاء عائدون" value={overview.returningClients} />
              </View>
            </View>
          ) : null}

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
          ) : clients && clients.length > 0 ? (
            <FlatList
              data={clients}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.list}
              renderItem={({ item }) => <ClientRow client={item} />}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
              onEndReachedThreshold={0.4}
              onEndReached={onEndReached}
            />
          ) : (
            <EmptyCard title="مفيش عملاء مطابقين" />
          )}
        </SafeAreaView>
      </PermissionGate>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  kpiGrid: { padding: 16, paddingBottom: 0, gap: 12 },
  kpiRow: { flexDirection: "row-reverse", gap: 12 },
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
  rowTop: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", gap: 8 },
  name: { flex: 1, fontSize: type.body.fontSize, fontFamily: "Cairo_700Bold", color: colors.onSurface, textAlign: textStart },
  phone: { fontSize: type.caption.fontSize, fontFamily: "Cairo_400Regular", color: colors.onSurfaceVariant, textAlign: textStart },
  meta: { fontSize: type.caption.fontSize, fontFamily: "Cairo_500Medium", color: colors.onSurfaceVariant, textAlign: textStart },
  statusChip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  statusActive: { backgroundColor: colors.successContainer },
  statusDormant: { backgroundColor: colors.surfaceContainer },
  statusText: { fontSize: type.caption.fontSize, fontFamily: "Cairo_700Bold", color: colors.onSurface },
});
