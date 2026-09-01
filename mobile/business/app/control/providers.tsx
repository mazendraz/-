import { useCallback, useEffect, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack } from "expo-router";
import type { ApiProviderPerformance, ApiProviderPerformanceSummary } from "@alassema/core";
import { colors, type } from "@alassema/core";
import { ApiError, textStart, useRefreshOnFocus } from "@alassema/mobile-shared";
import { fetchProviderPerformance, fetchProviderPerformanceSummary } from "../../lib/controlProviders";
import { formatEgp } from "../../lib/money";
import PermissionGate from "../../components/PermissionGate";
import KpiTile from "../../components/KpiTile";
import { ListSkeleton, EmptyCard, ErrorCard } from "../../components/ListStates";

const PAGE_SIZE = 30;

function ProviderRow({ provider }: { provider: ApiProviderPerformance }) {
  return (
    <View style={styles.row}>
      <View style={styles.rowTop}>
        <Text style={styles.name} numberOfLines={1}>{provider.companyName}</Text>
        <View style={[styles.statusChip, provider.status === "ACTIVE" ? styles.statusOk : styles.statusReview]}>
          <Text style={styles.statusText}>{provider.status === "ACTIVE" ? "نشط" : "يحتاج مراجعة"}</Text>
        </View>
      </View>
      <Text style={styles.category}>{provider.categoryLabel}</Text>
      <Text style={styles.meta}>
        {provider.requestsHandled} طلب · إنجاز {provider.completionRatePercent}% · ★ {provider.avgRating.toFixed(1)}
      </Text>
      <Text style={styles.meta}>
        {formatEgp(provider.serviceValue)} · اعتراضات {provider.discrepancyRatePercent}%
      </Text>
    </View>
  );
}

export default function ControlProviders() {
  const [summary, setSummary] = useState<ApiProviderPerformanceSummary | null>(null);
  const [providers, setProviders] = useState<ApiProviderPerformance[] | null>(null);
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
        const [summaryResult, providersResult] = await Promise.all([
          opts.page === 1 ? fetchProviderPerformanceSummary() : Promise.resolve(summary),
          fetchProviderPerformance({ page: opts.page, pageSize: PAGE_SIZE, search: search || undefined }),
        ]);
        if (summaryResult) setSummary(summaryResult);
        setProviders((prev) => (opts.append && prev ? [...prev, ...providersResult.data] : providersResult.data));
        setTotal(providersResult.meta.total);
        setPage(opts.page);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "تعذّر تحميل البيانات. جرّب تاني.");
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
    if (loadingMore || loading || !providers) return;
    if (providers.length >= total) return;
    setLoadingMore(true);
    void load({ page: page + 1, append: true, silent: true });
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "أداء مقدّمي الخدمة" }} />
      <PermissionGate permission={["business:read", "analytics:read"]}>
        <SafeAreaView style={styles.container} edges={["top"]}>
          {summary ? (
            <View style={styles.kpiGrid}>
              <View style={styles.kpiRow}>
                <KpiTile label="إجمالي المقدّمين" value={summary.totalProviders} />
                <KpiTile label="نشطون" value={summary.activeProviders} />
              </View>
              <View style={styles.kpiRow}>
                <KpiTile label="متوسط التقييم" value={summary.avgRating.toFixed(1)} />
                <KpiTile label="نسبة الاعتراضات" value={`${summary.discrepancyRatePercent}%`} />
              </View>
            </View>
          ) : null}

          <View style={styles.searchWrap}>
            <TextInput
              style={styles.search}
              value={search}
              onChangeText={setSearch}
              placeholder="بحث باسم الشركة"
              placeholderTextColor={colors.onSurfaceVariant}
              textAlign={textStart === "right" ? "right" : "left"}
            />
          </View>

          {loading ? (
            <ListSkeleton />
          ) : error ? (
            <ErrorCard message={error} onRetry={() => load({ page: 1, append: false })} />
          ) : providers && providers.length > 0 ? (
            <FlatList
              data={providers}
              keyExtractor={(item) => item.companyId}
              contentContainerStyle={styles.list}
              renderItem={({ item }) => <ProviderRow provider={item} />}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
              onEndReachedThreshold={0.4}
              onEndReached={onEndReached}
            />
          ) : (
            <EmptyCard title="مفيش نتائج مطابقة" />
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
  category: { fontSize: type.caption.fontSize, fontFamily: "Cairo_500Medium", color: colors.primary, textAlign: textStart },
  meta: { fontSize: type.caption.fontSize, fontFamily: "Cairo_400Regular", color: colors.onSurfaceVariant, textAlign: textStart },
  statusChip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  statusOk: { backgroundColor: colors.successContainer },
  statusReview: { backgroundColor: colors.errorContainer },
  statusText: { fontSize: type.caption.fontSize, fontFamily: "Cairo_700Bold", color: colors.onSurface },
});
