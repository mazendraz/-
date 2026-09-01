import { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack } from "expo-router";
import type { ApiDesktopOverview } from "@alassema/core";
import { colors, type } from "@alassema/core";
import { ApiError, useRefreshOnFocus } from "@alassema/mobile-shared";
import { fetchControlOverview } from "../../lib/controlOverview";
import { formatEgp } from "../../lib/money";
import PermissionGate from "../../components/PermissionGate";
import KpiTile from "../../components/KpiTile";
import SeriesChart from "../../components/SeriesChart";
import FunnelBar from "../../components/FunnelBar";
import ActivityRow from "../../components/ActivityRow";
import { ListSkeleton, EmptyCard, ErrorCard } from "../../components/ListStates";

export default function ControlOverview() {
  const [data, setData] = useState<ApiDesktopOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setError(null);
    try {
      setData(await fetchControlOverview(30));
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

  function onRefresh() {
    setRefreshing(true);
    void load(true);
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "نظرة عامة" }} />
      <PermissionGate permission={["overview:read", "analytics:read"]}>
        <SafeAreaView style={styles.container} edges={["bottom"]}>
          {loading ? (
            <ListSkeleton />
          ) : error ? (
            <ErrorCard message={error} onRetry={() => load()} />
          ) : data ? (
            <ScrollView
              contentContainerStyle={styles.content}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            >
              <View style={styles.kpiRow}>
                <KpiTile label="عملاء جدد" value={data.newClients} deltaPercent={data.trend.newClientsPercent} />
                <KpiTile label="طلبات جديدة" value={data.newRequests} deltaPercent={data.trend.newRequestsPercent} />
              </View>
              <View style={styles.kpiRow}>
                <KpiTile label="خدمات مكتملة" value={data.completedServices} deltaPercent={data.trend.completedServicesPercent} />
                <KpiTile label="قيمة الخدمات" value={formatEgp(data.serviceValue)} deltaPercent={data.trend.serviceValuePercent} />
              </View>
              <View style={styles.kpiRow}>
                <KpiTile label="إيرادات العاصمة" value={formatEgp(data.alAsimaRevenue)} deltaPercent={data.trend.alAsimaRevenuePercent} />
                <KpiTile label="المصروفات" value={formatEgp(data.expenses)} deltaPercent={data.trend.expensesPercent} />
              </View>

              {data.needsAttention.discrepanciesRequiringReview + data.needsAttention.requestsAwaitingProviderResponse + data.needsAttention.outstandingCommissionCount > 0 ? (
                <View style={styles.attentionCard}>
                  <Text style={styles.attentionTitle}>يحتاج انتباه</Text>
                  {data.needsAttention.discrepanciesRequiringReview > 0 ? (
                    <Text style={styles.attentionRow}>{data.needsAttention.discrepanciesRequiringReview} اعتراض على سعر يحتاج مراجعة</Text>
                  ) : null}
                  {data.needsAttention.requestsAwaitingProviderResponse > 0 ? (
                    <Text style={styles.attentionRow}>{data.needsAttention.requestsAwaitingProviderResponse} طلب مستنى رد مقدّم الخدمة</Text>
                  ) : null}
                  {data.needsAttention.outstandingCommissionCount > 0 ? (
                    <Text style={styles.attentionRow}>{data.needsAttention.outstandingCommissionCount} عمولة معلّقة</Text>
                  ) : null}
                </View>
              ) : null}

              {data.series.length > 0 ? (
                <View>
                  <Text style={styles.sectionTitle}>قيمة الخدمات مقابل الإيرادات</Text>
                  <SeriesChart
                    dates={data.series.map((s) => s.date)}
                    lines={[
                      { label: "قيمة الخدمات", color: colors.primary, values: data.series.map((s) => s.serviceValue) },
                      { label: "الإيرادات", color: colors.success, values: data.series.map((s) => s.revenue) },
                    ]}
                    valueFormatter={formatEgp}
                  />
                </View>
              ) : null}

              <View>
                <Text style={styles.sectionTitle}>مسار الطلبات</Text>
                <FunnelBar
                  steps={[
                    { label: "تم الإرسال", value: data.funnel.submitted },
                    { label: "تم التواصل", value: data.funnel.contacted },
                    { label: "قيد التنفيذ", value: data.funnel.inProgress },
                    { label: "مكتمل", value: data.funnel.completed },
                  ]}
                />
              </View>

              <View>
                <Text style={styles.sectionTitle}>آخر الأنشطة</Text>
                {data.recentActivity.length > 0 ? (
                  <View style={styles.activityList}>
                    {data.recentActivity.map((a) => (
                      <ActivityRow key={a.id} activity={a} />
                    ))}
                  </View>
                ) : (
                  <EmptyCard title="لسه مفيش نشاط" />
                )}
              </View>
            </ScrollView>
          ) : null}
        </SafeAreaView>
      </PermissionGate>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, gap: 14 },
  kpiRow: { flexDirection: "row-reverse", gap: 12 },
  attentionCard: { backgroundColor: colors.errorContainer, borderRadius: 14, padding: 14, gap: 4 },
  attentionTitle: { fontSize: type.body.fontSize, fontFamily: "Cairo_700Bold", color: colors.onErrorContainer },
  attentionRow: { fontSize: type.caption.fontSize, fontFamily: "Cairo_500Medium", color: colors.onErrorContainer },
  sectionTitle: { fontSize: type.title.fontSize, fontFamily: "Alexandria_700Bold", color: colors.onSurface, marginBottom: 8 },
  activityList: { gap: 8 },
});
