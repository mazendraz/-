import { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import type { ApiCompany, ApiLead, ApiLeadStatus } from "@alassema/core";
import { colors, type } from "@alassema/core";
import { ApiError, textStart, useLiveEvents, useRefreshOnFocus } from "@alassema/mobile-shared";
import { fetchAdminLeads } from "../../lib/adminLeads";
import { fetchAdminCompanies } from "../../lib/adminCompanies";
import LeadRow from "../../components/LeadRow";
import FilterBar from "../../components/FilterBar";
import ScreenHeader from "../../components/ScreenHeader";
import { ListSkeleton, EmptyCard, ErrorCard } from "../../components/ListStates";

const PAGE_SIZE = 20;

/** A company picker as a text field + tap-to-select results row, not a
 *  dropdown/modal library this app doesn't otherwise have — matches the
 *  weight of the rest of this screen's filter controls. */
function CompanyFilter({
  companyId,
  companyName,
  onSelect,
  onClear,
}: {
  companyId: string | undefined;
  companyName: string | undefined;
  onSelect: (company: ApiCompany) => void;
  onClear: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ApiCompany[]>([]);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      fetchAdminCompanies({ search: query.trim(), pageSize: 6 })
        .then((res) => {
          if (!cancelled) setResults(res.data);
        })
        .catch(() => {
          if (!cancelled) setResults([]);
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  if (companyId) {
    return (
      <View style={styles.companyChipRow}>
        <Pressable style={styles.companyChip} onPress={onClear}>
          <Text style={styles.companyChipLabel}>الشركة: {companyName} ✕</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.companyFilterWrap}>
      <TextInput
        style={styles.companySearch}
        value={query}
        onChangeText={setQuery}
        placeholder="فلترة بالشركة (اختياري)"
        placeholderTextColor={colors.onSurfaceVariant}
        textAlign={textStart === "right" ? "right" : "left"}
      />
      {results.length > 0 ? (
        <View style={styles.companyResults}>
          {results.map((c) => (
            <Pressable
              key={c.id}
              style={styles.companyResultRow}
              onPress={() => {
                onSelect(c);
                setQuery("");
                setResults([]);
              }}
            >
              <Text style={styles.companyResultLabel}>{c.name}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

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

export default function AdminLeads() {
  const [leads, setLeads] = useState<ApiLead[] | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const initialStatus = useInitialStatus();
  const [status, setStatus] = useState<ApiLeadStatus | undefined>(initialStatus);
  const [search, setSearch] = useState("");
  const [companyId, setCompanyId] = useState<string | undefined>(undefined);
  const [companyName, setCompanyName] = useState<string | undefined>(undefined);
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
        const result = await fetchAdminLeads({
          page: opts.page,
          pageSize: PAGE_SIZE,
          status,
          search: search || undefined,
          companyId,
        });
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
    [status, search, companyId],
  );

  useEffect(() => {
    setLoading(true);
    void load({ page: 1, append: false });
  }, [status, search, companyId]); // eslint-disable-line react-hooks/exhaustive-deps

  useRefreshOnFocus(() => {
    void load({ page: 1, append: false, silent: true });
  });

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
      <FilterBar status={status} onStatusChange={setStatus} search={search} onSearchChange={setSearch} />
      <CompanyFilter
        companyId={companyId}
        companyName={companyName}
        onSelect={(c) => {
          setCompanyId(c.id);
          setCompanyName(c.name);
        }}
        onClear={() => {
          setCompanyId(undefined);
          setCompanyName(undefined);
        }}
      />

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
            <LeadRow lead={item} showCompany={!companyId} onPress={() => router.push(`/lead/${item.id}`)} />
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          onEndReachedThreshold={0.4}
          onEndReached={onEndReached}
        />
      ) : (
        <EmptyCard
          title={status || search || companyId ? "مفيش طلبات مطابقة" : "لسه مفيش طلبات"}
          message={status || search || companyId ? "جرّب تغيّر الفلتر أو البحث." : "أول طلب جديد هيظهر هنا أول ما يوصل."}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { padding: 16, paddingTop: 12 },
  separator: { height: 10 },
  companyFilterWrap: { paddingHorizontal: 16, paddingTop: 8 },
  companySearch: {
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
    fontSize: type.label.fontSize,
    fontFamily: "Cairo_400Regular",
    color: colors.onSurface,
    backgroundColor: colors.surface,
  },
  companyResults: {
    marginTop: 4,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: 10,
    backgroundColor: colors.surface,
    overflow: "hidden",
  },
  companyResultRow: { paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.outlineVariant },
  companyResultLabel: { fontSize: type.label.fontSize, fontFamily: "Cairo_500Medium", color: colors.onSurface, textAlign: textStart },
  companyChipRow: { paddingHorizontal: 16, paddingTop: 8 },
  companyChip: { alignSelf: "flex-start", backgroundColor: colors.primaryContainer, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
  companyChipLabel: { fontSize: type.caption.fontSize, fontFamily: "Cairo_700Bold", color: colors.onPrimaryContainer },
});
