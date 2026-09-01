import { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack } from "expo-router";
import type { ApiPricingAnalytics, ApiPricingIntelligence } from "@alassema/core";
import { colors, type } from "@alassema/core";
import { ApiError, textStart, useRefreshOnFocus } from "@alassema/mobile-shared";
import { fetchPricingAnalytics, fetchPricingIntelligence } from "../../lib/controlPricing";
import { formatEgp } from "../../lib/money";
import PermissionGate from "../../components/PermissionGate";
import KpiTile from "../../components/KpiTile";
import SeriesChart from "../../components/SeriesChart";
import { ListSkeleton, ErrorCard } from "../../components/ListStates";

const VARIANCE_PREVIEW = 15;

export default function ControlPricing() {
  const [analytics, setAnalytics] = useState<ApiPricingAnalytics | null>(null);
  const [intelligence, setIntelligence] = useState<ApiPricingIntelligence | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setError(null);
    try {
      const [a, i] = await Promise.all([fetchPricingAnalytics(90), fetchPricingIntelligence({ pageSize: VARIANCE_PREVIEW })]);
      setAnalytics(a);
      setIntelligence(i);
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
      <Stack.Screen options={{ headerShown: true, title: "تحليلات الأسعار" }} />
      <PermissionGate permission="analytics:read">
        <SafeAreaView style={styles.container} edges={["bottom"]}>
          {loading ? (
            <ListSkeleton />
          ) : error ? (
            <ErrorCard message={error} onRetry={() => load()} />
          ) : analytics && intelligence ? (
            <ScrollView
              contentContainerStyle={styles.content}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            >
              <View style={styles.kpiRow}>
                <KpiTile label="متوسط السعر المقدّر" value={formatEgp(analytics.avgEstimatedPrice)} />
                <KpiTile label="متوسط سعر مقدّم الخدمة" value={formatEgp(analytics.avgProviderFinalPrice)} />
              </View>
              <View style={styles.kpiRow}>
                <KpiTile label="متوسط السعر المؤكّد" value={formatEgp(analytics.avgClientConfirmedPrice)} />
                <KpiTile label="الفرق %" value={`${analytics.avgDifferencePercent}%`} />
              </View>
              <View style={styles.kpiRow}>
                <KpiTile label="نسبة الاعتراضات" value={`${analytics.priceDiscrepancyRatePercent}%`} />
                <KpiTile label="أعمال إضافية" value={`${analytics.additionalWorkFrequencyPercent}%`} />
              </View>

              {analytics.trend.length > 0 ? (
                <View>
                  <Text style={styles.sectionTitle}>الاتجاه الأسبوعي (90 يوم)</Text>
                  <SeriesChart
                    dates={analytics.trend.map((t) => t.date)}
                    lines={[
                      { label: "مقدّر", color: colors.outline, values: analytics.trend.map((t) => t.avgEstimated) },
                      { label: "سعر مقدّم الخدمة", color: colors.primary, values: analytics.trend.map((t) => t.avgProviderFinal) },
                      { label: "سعر مؤكّد", color: colors.success, values: analytics.trend.map((t) => t.avgClientConfirmed) },
                    ]}
                    valueFormatter={formatEgp}
                  />
                </View>
              ) : null}

              {analytics.byCategory.length > 0 ? (
                <View>
                  <Text style={styles.sectionTitle}>حسب التصنيف</Text>
                  <View style={styles.tableList}>
                    {analytics.byCategory.map((c) => (
                      <View key={c.category} style={styles.tableRow}>
                        <Text style={styles.tableLabel} numberOfLines={1}>{c.category}</Text>
                        <Text style={styles.tableValue}>{c.count} · فرق {c.avgDifferencePercent}%</Text>
                      </View>
                    ))}
                  </View>
                </View>
              ) : null}

              {analytics.byProvider.length > 0 ? (
                <View>
                  <Text style={styles.sectionTitle}>حسب مقدّم الخدمة (أعلى 10)</Text>
                  <View style={styles.tableList}>
                    {analytics.byProvider.map((p) => (
                      <View key={p.companyId} style={styles.tableRow}>
                        <Text style={styles.tableLabel} numberOfLines={1}>{p.companyName}</Text>
                        <Text style={styles.tableValue}>{p.count} · فرق {p.avgDifferencePercent}%</Text>
                      </View>
                    ))}
                  </View>
                </View>
              ) : null}

              {intelligence.variance.length > 0 ? (
                <View>
                  <Text style={styles.sectionTitle}>
                    أكبر فروق الأسعار ({intelligence.variance.length} من {intelligence.varianceTotal})
                  </Text>
                  <View style={styles.tableList}>
                    {intelligence.variance.map((v) => (
                      <View key={v.leadId} style={styles.varianceRow}>
                        <View style={styles.varianceTop}>
                          <Text style={styles.tableLabel} numberOfLines={1}>{v.service} — {v.companyName}</Text>
                          <Text style={[styles.deltaText, v.deltaPercent && v.deltaPercent > 0 ? styles.deltaUp : styles.deltaDown]}>
                            {v.deltaPercent != null ? `${v.deltaPercent > 0 ? "+" : ""}${v.deltaPercent}%` : "—"}
                          </Text>
                        </View>
                        <Text style={styles.varianceMeta}>
                          {v.refNumber} · {v.estimatedPrice != null ? formatEgp(v.estimatedPrice) : "—"} ← {formatEgp(v.finalPrice)}
                        </Text>
                      </View>
                    ))}
                  </View>
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
  tableList: { gap: 8 },
  tableRow: { flexDirection: "row-reverse", justifyContent: "space-between", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.outlineVariant, borderRadius: 10, padding: 10, gap: 8 },
  tableLabel: { flex: 1, fontSize: type.label.fontSize, fontFamily: "Cairo_600SemiBold", color: colors.onSurface, textAlign: textStart },
  tableValue: { fontSize: type.caption.fontSize, fontFamily: "Cairo_500Medium", color: colors.onSurfaceVariant },
  varianceRow: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.outlineVariant, borderRadius: 10, padding: 10, gap: 4 },
  varianceTop: { flexDirection: "row-reverse", justifyContent: "space-between", gap: 8 },
  deltaText: { fontSize: type.caption.fontSize, fontFamily: "Cairo_700Bold" },
  deltaUp: { color: colors.error },
  deltaDown: { color: colors.success },
  varianceMeta: { fontSize: type.caption.fontSize, fontFamily: "Cairo_400Regular", color: colors.onSurfaceVariant, textAlign: textStart },
});
