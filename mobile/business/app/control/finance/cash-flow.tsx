import { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack } from "expo-router";
import type { ApiCashFlow } from "@alassema/core";
import { colors, type } from "@alassema/core";
import { ApiError, useRefreshOnFocus } from "@alassema/mobile-shared";
import { fetchCashFlow } from "../../../lib/controlFinance";
import { formatEgp } from "../../../lib/money";
import PermissionGate from "../../../components/PermissionGate";
import KpiTile from "../../../components/KpiTile";
import SeriesChart from "../../../components/SeriesChart";
import { ListSkeleton, ErrorCard } from "../../../components/ListStates";

export default function CashFlow() {
  const [data, setData] = useState<ApiCashFlow | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setError(null);
    try {
      setData(await fetchCashFlow(30));
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
      <Stack.Screen options={{ headerShown: true, title: "التدفق النقدي" }} />
      <PermissionGate permission="finance:read">
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
                <KpiTile label="دخل" value={formatEgp(data.moneyIn)} />
                <KpiTile label="خارج" value={formatEgp(data.moneyOut)} />
              </View>
              <View style={styles.kpiRow}>
                <KpiTile label="صافي التدفق" value={formatEgp(data.netCashFlow)} />
                <KpiTile label="الرصيد الحالي" value={formatEgp(data.cashBalance)} />
              </View>

              {data.series.length > 0 ? (
                <View>
                  <Text style={styles.sectionTitle}>آخر 30 يوم</Text>
                  <SeriesChart
                    dates={data.series.map((s) => s.date)}
                    lines={[
                      { label: "دخل", color: colors.success, values: data.series.map((s) => s.moneyIn) },
                      { label: "خارج", color: colors.error, values: data.series.map((s) => s.moneyOut) },
                    ]}
                    valueFormatter={formatEgp}
                  />
                </View>
              ) : null}
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
  sectionTitle: { fontSize: type.title.fontSize, fontFamily: "Alexandria_700Bold", color: colors.onSurface, marginBottom: 8 },
});
