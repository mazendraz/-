import { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import type { ApiLead, ApiLeadStats } from "@alassema/core";
import { colors, type } from "@alassema/core";
import { ApiError, useLiveEvents, useRefreshOnFocus } from "@alassema/mobile-shared";
import { fetchLeads, fetchProviderStats } from "../../lib/leads";
import { useStaffAuth } from "../../lib/staffAuth";
import { hasCompany } from "../../lib/permissions";
import KpiTile from "../../components/KpiTile";
import LeadRow from "../../components/LeadRow";
import ScreenHeader from "../../components/ScreenHeader";
import { ListSkeleton, EmptyCard, ErrorCard } from "../../components/ListStates";

export default function ProviderOverview() {
  const { user } = useStaffAuth();
  const [stats, setStats] = useState<ApiLeadStats | null>(null);
  const [recentLeads, setRecentLeads] = useState<ApiLead[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setError(null);
    try {
      const [statsResult, leadsResult] = await Promise.all([
        fetchProviderStats(),
        fetchLeads({ page: 1, pageSize: 5 }),
      ]);
      setStats(statsResult);
      setRecentLeads(leadsResult.data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "تعذّر تحميل البيانات. جرّب تاني.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (hasCompany(user)) void load();
    else setLoading(false);
  }, [load, user]);

  useRefreshOnFocus(() => {
    if (hasCompany(user)) void load(true);
  });

  useLiveEvents((event) => {
    if ((event.type === "lead" || event.type === "lead-status") && hasCompany(user)) {
      void load(true);
    }
  });

  function onRefresh() {
    setRefreshing(true);
    void load(true);
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScreenHeader title="الرئيسية" />

      {!hasCompany(user) ? (
        <EmptyCard
          title="حسابك لسه مش مربوط بشركة"
          message="كلّم الأدمن عشان يربط حسابك بشركتك — بعدها هتلاقي طلباتك وإحصائياتك هنا."
        />
      ) : loading ? (
        <ListSkeleton />
      ) : error ? (
        <ErrorCard message={error} onRetry={() => load()} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          <View style={styles.kpiRow}>
            <KpiTile
              label="إجمالي الطلبات"
              value={stats?.total ?? 0}
              deltaPercent={stats?.recent ? deltaPercent(stats.recent.current, stats.recent.previous) : undefined}
            />
            <KpiTile label="جديد" value={stats?.byStatus.New ?? 0} />
          </View>
          <View style={styles.kpiRow}>
            <KpiTile label="قيد التنفيذ" value={stats?.byStatus["In Progress"] ?? 0} />
            <KpiTile label="مكتمل" value={stats?.byStatus.Completed ?? 0} />
          </View>

          <Text style={styles.sectionTitle}>أحدث الطلبات</Text>
          {recentLeads && recentLeads.length > 0 ? (
            <View style={styles.recentList}>
              {recentLeads.map((lead) => (
                <LeadRow key={lead.id} lead={lead} onPress={() => router.push(`/lead/${lead.id}`)} />
              ))}
            </View>
          ) : (
            <EmptyCard title="لسه مفيش طلبات" message="أول طلب جديد هيظهر هنا أول ما يوصل." />
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

/** null when the previous window was zero — "no comparable baseline", not
 *  0% or ∞%. Matches ApiLeadStats.recent's own documented semantics. */
function deltaPercent(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? null : null;
  return ((current - previous) / previous) * 100;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, gap: 12 },
  kpiRow: { flexDirection: "row-reverse", gap: 12 },
  sectionTitle: {
    fontSize: type.title.fontSize,
    fontFamily: "Alexandria_700Bold",
    color: colors.onSurface,
    marginTop: 8,
  },
  recentList: { gap: 10 },
});
