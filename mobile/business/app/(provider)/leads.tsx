import { useCallback, useEffect, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import type { ApiLead, ApiLeadStatus } from "@alassema/core";
import { ApiError, useLiveEvents, useRefreshOnFocus } from "@alassema/mobile-shared";
import { fetchLeads } from "../../lib/leads";
import { useStaffAuth } from "../../lib/staffAuth";
import { hasCompany } from "../../lib/permissions";
import LeadRow from "../../components/LeadRow";
import FilterBar from "../../components/FilterBar";
import ScreenHeader from "../../components/ScreenHeader";
import { ListSkeleton, EmptyCard, ErrorCard } from "../../components/ListStates";

const PAGE_SIZE = 20;

/**
 * A status passed in the URL — how the overview's KPI tiles hand off ("28
 * جديد" → this list, already filtered to New). Validated against the real
 * enum rather than cast: the value arrives as a string from a route param, and
 * a typo'd or stale link must fall back to "all", never filter on a status the
 * API would reject.
 */
function useInitialStatus(): ApiLeadStatus | undefined {
  const { status } = useLocalSearchParams<{ status?: string }>();
  return STATUSES.includes(status as ApiLeadStatus) ? (status as ApiLeadStatus) : undefined;
}

const STATUSES: readonly ApiLeadStatus[] = ["New", "Contacted", "In Progress", "Completed", "Cancelled"];

export default function ProviderLeads() {
  const { user } = useStaffAuth();
  const [leads, setLeads] = useState<ApiLead[] | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const initialStatus = useInitialStatus();
  const [status, setStatus] = useState<ApiLeadStatus | undefined>(initialStatus);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Tab screens stay mounted once visited, so `useState(initialStatus)` alone
  // would seed the filter on the FIRST arrival and silently ignore every later
  // hand-off from a KPI tile. Syncing on the param keeps the list honest about
  // the link the user just followed.
  useEffect(() => {
    if (initialStatus !== undefined) setStatus(initialStatus);
  }, [initialStatus]);

  const load = useCallback(
    async (opts: { page: number; append: boolean; silent?: boolean }) => {
      if (!opts.silent) setError(null);
      try {
        const result = await fetchLeads({ page: opts.page, pageSize: PAGE_SIZE, status, search: search || undefined });
        setLeads((prev) => (opts.append && prev ? [...prev, ...result.data] : result.data));
        setTotal(result.meta.total);
        setPage(opts.page);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "تعذّر تحميل الطلبات. جرّب تاني.");
      } finally {
        setLoading(false);
        setLoadingMore(false);
        setRefreshing(false);
      }
    },
    [status, search],
  );

  // Re-fetch page 1 whenever filters change.
  useEffect(() => {
    setLoading(true);
    void load({ page: 1, append: false });
  }, [status, search]); // eslint-disable-line react-hooks/exhaustive-deps

  useRefreshOnFocus(() => {
    void load({ page: 1, append: false, silent: true });
  });

  // Live updates: a new lead, or one changing status, invalidates and
  // refetches page 1 — the event never carries data, only "something
  // changed" (api's realtime.service.ts). useRefreshOnFocus above stays
  // wired as the fallback for when the stream is reconnecting; this doesn't
  // replace it, it's just faster while connected.
  useLiveEvents((event) => {
    if (event.type === "lead" || event.type === "lead-status") {
      void load({ page: 1, append: false, silent: true });
    }
  });

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
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScreenHeader title="الطلبات" />

      {/* A provider with no company linked has no leads — legal state, not
          an error. Same explanatory treatment as the overview screen. */}
      {!hasCompany(user) ? (
        <EmptyCard
          title="حسابك لسه مش مربوط بشركة"
          message="كلّم الأدمن عشان يربط حسابك بشركتك — بعدها هتلاقي طلباتك هنا."
        />
      ) : (
        <>
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
              renderItem={({ item }) => (
                <LeadRow lead={item} onPress={() => router.push(`/lead/${item.id}`)} />
              )}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
              onEndReachedThreshold={0.4}
              onEndReached={onEndReached}
            />
          ) : (
            <EmptyCard
              title={status || search ? "مفيش طلبات مطابقة" : "لسه مفيش طلبات"}
              message={status || search ? "جرّب تغيّر الفلتر أو البحث." : "أول طلب جديد هيظهر هنا أول ما يوصل."}
            />
          )}
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { padding: 16, paddingTop: 12 },
  separator: { height: 10 },
});
