import { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import type { ApiLead, ApiLeadStats } from "@alassema/core";
import { colors, type } from "@alassema/core";
import { ApiError, useLiveEvents, useRefreshOnFocus } from "@alassema/mobile-shared";
import { fetchAdminLeads, fetchAdminStats } from "../../lib/adminLeads";
import KpiTile from "../../components/KpiTile";
import LeadRow from "../../components/LeadRow";
import LeadsChart from "../../components/LeadsChart";
import { ListSkeleton, EmptyCard, ErrorCard } from "../../components/ListStates";

export default function AdminOverview() {
  const [stats, setStats] = useState<ApiLeadStats | null>(null);
  const [recentLeads, setRecentLeads] = useState<ApiLead[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setError(null);
    try {
      const [statsResult, leadsResult] = await Promise.all([
        fetchAdminStats(),
        fetchAdminLeads({ page: 1, pageSize: 5 }),
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
    void load();
  }, [load]);

  useRefreshOnFocus(() => void load(true));

  useLiveEvents((event) => {
    if (event.type === "lead" || event.type === "lead-status") void load(true);
  });

  function onRefresh() {
    setRefreshing(true);
    void load(true);
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ListSkeleton />
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <ErrorCard message={error} onRetry={() => load()} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
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
        {stats?.catalog ? (
          <View style={styles.kpiRow}>
            <KpiTile label="شركات نشطة" value={`${stats.catalog.activeCompanies} / ${stats.catalog.companies}`} />
            <KpiTile label="تصنيفات" value={stats.catalog.categories} />
          </View>
        ) : null}

        {stats?.perDay ? <LeadsChart perDay={stats.perDay} /> : null}

        {stats?.byCompany && stats.byCompany.length > 0 ? (
          <View>
            <Text style={styles.sectionTitle}>أكتر الشركات نشاطًا</Text>
            <View style={styles.companyList}>
              {stats.byCompany.map((c) => (
                <View key={c.companyId} style={styles.companyRow}>
                  <View style={styles.companyInfo}>
                    <Text style={styles.companyName} numberOfLines={1}>{c.companyName}</Text>
                    <Text style={styles.companyMeta}>
                      {c.leads} طلب · {c.completed} مكتمل · تحويل {c.conversion}%
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        <Text style={styles.sectionTitle}>أحدث الطلبات</Text>
        {recentLeads && recentLeads.length > 0 ? (
          <View style={styles.recentList}>
            {recentLeads.map((lead) => (
              <LeadRow key={lead.id} lead={lead} showCompany onPress={() => router.push(`/lead/${lead.id}`)} />
            ))}
          </View>
        ) : (
          <EmptyCard title="لسه مفيش طلبات" message="أول طلب جديد هيظهر هنا أول ما يوصل." />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function deltaPercent(current: number, previous: number): number | null {
  if (previous === 0) return null;
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
  companyList: { gap: 8 },
  companyRow: {
    flexDirection: "row-reverse",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: 12,
    padding: 12,
  },
  companyInfo: { flex: 1, gap: 2 },
  companyName: { fontSize: type.body.fontSize, fontFamily: "Cairo_700Bold", color: colors.onSurface, textAlign: "right" },
  companyMeta: { fontSize: type.caption.fontSize, fontFamily: "Cairo_400Regular", color: colors.onSurfaceVariant, textAlign: "right" },
  recentList: { gap: 10 },
});
