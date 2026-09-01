import { useCallback, useEffect, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, Stack } from "expo-router";
import type { ApiLead, ApiLeadStatus, ApiOperationsSummary } from "@alassema/core";
import { ApiError, useRefreshOnFocus } from "@alassema/mobile-shared";
import { fetchControlLeads, fetchOperationsSummary } from "../../lib/controlOperations";
import PermissionGate from "../../components/PermissionGate";
import KpiTile from "../../components/KpiTile";
import LeadRow from "../../components/LeadRow";
import FilterBar from "../../components/FilterBar";
import { ListSkeleton, EmptyCard, ErrorCard } from "../../components/ListStates";

const PAGE_SIZE = 20;

export default function ControlOperations() {
  const [summary, setSummary] = useState<ApiOperationsSummary | null>(null);
  const [leads, setLeads] = useState<ApiLead[] | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState<ApiLeadStatus | undefined>(undefined);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (opts: { page: number; append: boolean; silent?: boolean }) => {
      if (!opts.silent) setError(null);
      try {
        const [summaryResult, leadsResult] = await Promise.all([
          opts.page === 1 ? fetchOperationsSummary() : Promise.resolve(summary),
          fetchControlLeads({ page: opts.page, pageSize: PAGE_SIZE, status, search: search || undefined }),
        ]);
        if (summaryResult) setSummary(summaryResult);
        setLeads((prev) => (opts.append && prev ? [...prev, ...leadsResult.data] : leadsResult.data));
        setTotal(leadsResult.meta.total);
        setPage(opts.page);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "تعذّر تحميل البيانات. جرّب تاني.");
      } finally {
        setLoading(false);
        setLoadingMore(false);
        setRefreshing(false);
      }
    },
    [status, search], // eslint-disable-line react-hooks/exhaustive-deps
  );

  useEffect(() => {
    setLoading(true);
    void load({ page: 1, append: false });
  }, [status, search]); // eslint-disable-line react-hooks/exhaustive-deps

  useRefreshOnFocus(() => void load({ page: 1, append: false, silent: true }));

  function onRefresh() {
    setRefreshing(true);
    void load({ page: 1, append: false, silent: true });
  }

  function onEndReached() {
    if (loadingMore || loading || !leads) return;
    if (leads.length >= total) return;
    setLoadingMore(true);
    void load({ page: page + 1, append: true, silent: true });
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "العمليات" }} />
      <PermissionGate permission="operations:read">
        <SafeAreaView style={styles.container} edges={["top"]}>
          {summary ? (
            <View style={styles.kpiGrid}>
              <View style={styles.kpiRow}>
                <KpiTile label="طلبات جديدة" value={summary.pendingRequests} />
                <KpiTile label="خدمات نشطة" value={summary.activeServices} />
              </View>
              <View style={styles.kpiRow}>
                <KpiTile label="مستني تأكيد" value={summary.awaitingVerification} />
                <KpiTile label="اعتراضات" value={summary.discrepancies} />
              </View>
            </View>
          ) : null}

          <FilterBar status={status} onStatusChange={setStatus} search={search} onSearchChange={setSearch} />

          {loading ? (
            <ListSkeleton />
          ) : error ? (
            <ErrorCard message={error} onRetry={() => load({ page: 1, append: false })} />
          ) : leads && leads.length > 0 ? (
            <FlatList
              data={leads}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.list}
              renderItem={({ item }) => <LeadRow lead={item} showCompany onPress={() => router.push(`/lead/${item.id}`)} />}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
              onEndReachedThreshold={0.4}
              onEndReached={onEndReached}
            />
          ) : (
            <EmptyCard title={status || search ? "مفيش طلبات مطابقة" : "لسه مفيش طلبات"} />
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
  list: { padding: 16, paddingTop: 12 },
  separator: { height: 10 },
});
