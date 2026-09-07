import { useCallback, useEffect, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import type { ApiLead, ApiLeadStats } from "@alassema/core";
import { colors, type } from "@alassema/core";
import { ApiError, rowStart, useLiveEvents, useRefreshOnFocus } from "@alassema/mobile-shared";
import { fetchAdminLeads, fetchAdminStats } from "../../lib/adminLeads";
import { fetchMaintenanceStatus } from "../../lib/adminSettings";
import KpiTile from "../../components/KpiTile";
import LeadRow from "../../components/LeadRow";
import LeadsChart from "../../components/LeadsChart";
import MaintenanceBanner from "../../components/MaintenanceBanner";
import ScreenHeader from "../../components/ScreenHeader";
import SectionHeader from "../../components/SectionHeader";
import { ListSkeleton, EmptyCard, ErrorCard } from "../../components/ListStates";

export default function AdminOverview() {
  const [stats, setStats] = useState<ApiLeadStats | null>(null);
  const [recentLeads, setRecentLeads] = useState<ApiLead[] | null>(null);
  const [maintenanceOn, setMaintenanceOn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setError(null);
    try {
      const [statsResult, leadsResult, maintenance] = await Promise.all([
        fetchAdminStats(),
        fetchAdminLeads({ page: 1, pageSize: 5 }),
        fetchMaintenanceStatus().catch(() => null),
      ]);
      setStats(statsResult);
      setRecentLeads(leadsResult.data);
      if (maintenance) setMaintenanceOn(maintenance.enabled);
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

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScreenHeader title="الرئيسية" />

      {loading ? (
        <ListSkeleton />
      ) : error ? (
        <ErrorCard message={error} onRetry={() => load()} />
      ) : (
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {maintenanceOn ? <MaintenanceBanner /> : null}

        {/* Each tile opens the list that explains its own number — the status
            strings are ApiLeadStatus values, so the query is one the server
            actually supports. */}
        <View style={styles.kpiRow}>
          <KpiTile
            label="إجمالي الطلبات"
            value={stats?.total ?? 0}
            deltaPercent={stats?.recent ? deltaPercent(stats.recent.current, stats.recent.previous) : undefined}
            onPress={() => router.push("/(admin)/leads")}
            accessibilityHint="يفتح كل الطلبات"
          />
          <KpiTile
            label="جديد"
            value={stats?.byStatus.New ?? 0}
            onPress={() => router.push("/(admin)/leads?status=New")}
            accessibilityHint="يفتح الطلبات الجديدة"
          />
        </View>
        <View style={styles.kpiRow}>
          <KpiTile
            label="قيد التنفيذ"
            value={stats?.byStatus["In Progress"] ?? 0}
            onPress={() => router.push("/(admin)/leads?status=In%20Progress")}
            accessibilityHint="يفتح الطلبات قيد التنفيذ"
          />
          <KpiTile
            label="مكتمل"
            value={stats?.byStatus.Completed ?? 0}
            onPress={() => router.push("/(admin)/leads?status=Completed")}
            accessibilityHint="يفتح الطلبات المكتملة"
          />
        </View>
        {stats?.catalog ? (
          <View style={styles.kpiRow}>
            <KpiTile
              label="شركات نشطة"
              value={`${stats.catalog.activeCompanies} / ${stats.catalog.companies}`}
              onPress={() => router.push("/(admin)/companies")}
              accessibilityHint="يفتح الشركات"
            />
            <KpiTile
              label="تصنيفات"
              value={stats.catalog.categories}
              onPress={() => router.push("/categories")}
              accessibilityHint="يفتح التصنيفات"
            />
          </View>
        ) : null}

        {stats?.perDay ? <LeadsChart perDay={stats.perDay} onPress={() => router.push("/analytics")} /> : null}

        <Pressable
          style={({ pressed }) => [styles.analyticsCta, pressed && styles.analyticsCtaPressed]}
          onPress={() => router.push("/analytics")}
          accessibilityRole="button"
        >
          <Text style={styles.analyticsCtaText}>عرض التحليلات</Text>
          <Text style={styles.analyticsCtaChevron}>‹</Text>
        </Pressable>

        {stats?.byCompany && stats.byCompany.length > 0 ? (
          <View>
            <SectionHeader
              title="أكتر الشركات نشاطًا"
              actionLabel="عرض الكل"
              onAction={() => router.push("/(admin)/companies")}
            />
            <View style={styles.companyList}>
              {/* Pressable, because these are companies and every other list of
                  companies in this app opens one. They used to be inert Views
                  wearing full card styling — the strongest possible "tap me"
                  affordance attached to nothing. */}
              {stats.byCompany.map((c) => (
                <Pressable
                  key={c.companyId}
                  style={({ pressed }) => [styles.companyRow, pressed && styles.companyRowPressed]}
                  onPress={() => router.push(`/company/${c.companyId}`)}
                  accessibilityRole="button"
                  accessibilityLabel={`${c.companyName}: ${c.leads} طلب`}
                  accessibilityHint="يفتح بيانات الشركة"
                >
                  <View style={styles.companyInfo}>
                    <Text style={styles.companyName} numberOfLines={1}>{c.companyName}</Text>
                    <Text style={styles.companyMeta}>
                      {c.leads} طلب · {c.completed} مكتمل · تحويل {c.conversion}%
                    </Text>
                  </View>
                  <Text style={styles.companyChevron}>‹</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}

        <SectionHeader
          title="أحدث الطلبات"
          actionLabel="عرض الكل"
          onAction={() => router.push("/(admin)/leads")}
        />
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
      )}
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
  kpiRow: { flexDirection: rowStart, gap: 12 },
  analyticsCta: {
    flexDirection: rowStart,
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  analyticsCtaPressed: { opacity: 0.85 },
  analyticsCtaText: { fontSize: type.label.fontSize, fontFamily: "Cairo_700Bold", color: colors.onPrimary },
  analyticsCtaChevron: { fontSize: type.title.fontSize, color: colors.onPrimary },
  companyList: { gap: 8 },
  companyRow: {
    flexDirection: rowStart,
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: 12,
    padding: 12,
  },
  companyRowPressed: { backgroundColor: colors.surfaceContainer },
  companyChevron: { fontSize: type.subhead.fontSize, color: colors.outline },
  companyInfo: { flex: 1, gap: 2 },
  companyName: { fontSize: type.body.fontSize, fontFamily: "Cairo_700Bold", color: colors.onSurface, textAlign: "right" },
  companyMeta: { fontSize: type.caption.fontSize, fontFamily: "Cairo_400Regular", color: colors.onSurfaceVariant, textAlign: "right" },
  recentList: { gap: 10 },
});
