import { useCallback, useEffect, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, Stack } from "expo-router";
import type { ApiFinanceOverview } from "@alassema/core";
import { colors, type } from "@alassema/core";
import { ApiError, textStart, useRefreshOnFocus } from "@alassema/mobile-shared";
import { fetchFinanceOverview } from "../../../lib/controlFinance";
import { formatEgp } from "../../../lib/money";
import PermissionGate from "../../../components/PermissionGate";
import KpiTile from "../../../components/KpiTile";
import { ListSkeleton, ErrorCard } from "../../../components/ListStates";

export default function ControlFinanceOverview() {
  const [data, setData] = useState<ApiFinanceOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setError(null);
    try {
      setData(await fetchFinanceOverview());
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
      <Stack.Screen options={{ headerShown: true, title: "المالية" }} />
      <PermissionGate permission={["finance:read", "analytics:read"]}>
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
              <View style={styles.navRow}>
                <Pressable style={styles.navLink} onPress={() => router.push("/control/finance/cash-flow")}>
                  <Text style={styles.navLinkText}>التدفق النقدي ‹</Text>
                </Pressable>
                <Pressable style={styles.navLink} onPress={() => router.push("/control/finance/transactions")}>
                  <Text style={styles.navLinkText}>المعاملات ‹</Text>
                </Pressable>
              </View>

              <View style={styles.kpiRow}>
                <KpiTile label="قيمة الخدمات" value={formatEgp(data.serviceValueProcessed)} />
                <KpiTile label="الإيرادات المعترف بها" value={formatEgp(data.recognizedRevenue)} />
              </View>
              <View style={styles.kpiRow}>
                <KpiTile label="إيرادات محصّلة" value={formatEgp(data.collectedRevenue)} />
                <KpiTile label="إيرادات معلّقة" value={formatEgp(data.outstandingRevenue)} />
              </View>
              <View style={styles.kpiRow}>
                <KpiTile label="متنازع عليها" value={formatEgp(data.disputedRevenue)} />
                <KpiTile label="المصروفات" value={formatEgp(data.totalExpenses)} />
              </View>
              <View style={styles.kpiRow}>
                <KpiTile label="صافي الدخل" value={formatEgp(data.netIncome)} />
                <KpiTile label="الوضع النقدي" value={formatEgp(data.cashPosition)} />
              </View>

              <View style={styles.pipelineCard}>
                <Text style={styles.pipelineTitle}>خط أنابيب العمولات</Text>
                <View style={styles.pipelineRow}>
                  <Text style={styles.pipelineLabel}>متوقّعة</Text>
                  <Text style={styles.pipelineValue}>{formatEgp(data.commissionPipeline.expected)}</Text>
                </View>
                <View style={styles.pipelineRow}>
                  <Text style={styles.pipelineLabel}>محصّلة</Text>
                  <Text style={styles.pipelineValue}>{formatEgp(data.commissionPipeline.collected)}</Text>
                </View>
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
  content: { padding: 16, gap: 12 },
  navRow: { flexDirection: "row-reverse", gap: 10, marginBottom: 4 },
  navLink: { flex: 1, backgroundColor: colors.primaryContainer, borderRadius: 10, padding: 12, alignItems: "center" },
  navLinkText: { fontFamily: "Cairo_700Bold", fontSize: type.label.fontSize, color: colors.onPrimaryContainer },
  kpiRow: { flexDirection: "row-reverse", gap: 12 },
  pipelineCard: { backgroundColor: colors.surfaceContainer, borderRadius: 14, padding: 16, gap: 8, marginTop: 8 },
  pipelineTitle: { fontSize: type.body.fontSize, fontFamily: "Cairo_700Bold", color: colors.onSurface, textAlign: textStart },
  pipelineRow: { flexDirection: "row-reverse", justifyContent: "space-between" },
  pipelineLabel: { fontSize: type.label.fontSize, fontFamily: "Cairo_500Medium", color: colors.onSurfaceVariant },
  pipelineValue: { fontSize: type.label.fontSize, fontFamily: "Cairo_700Bold", color: colors.onSurface },
});
