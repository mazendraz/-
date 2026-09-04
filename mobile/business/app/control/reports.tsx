import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack } from "expo-router";
import type { ApiReport, ApiReportType } from "@alassema/core";
import { colors, type } from "@alassema/core";
import { ApiError } from "@alassema/mobile-shared";
import { fetchReport, REPORT_TYPES } from "../../lib/controlReports";
import PermissionGate from "../../components/PermissionGate";
import ReportTable from "../../components/ReportTable";
import TruncatedNotice from "../../components/TruncatedNotice";
import { ChipBar, Chip } from "../../components/ChipBar";
import { ListSkeleton, ErrorCard, EmptyCard } from "../../components/ListStates";

export default function Reports() {
  const [type, setType] = useState<ApiReportType | null>(null);
  const [report, setReport] = useState<ApiReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function selectType(t: ApiReportType) {
    setType(t);
    setLoading(true);
    setError(null);
    try {
      setReport(await fetchReport({ type: t }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "تعذّر توليد التقرير. جرّب تاني.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "التقارير" }} />
      <PermissionGate permission="reports:read">
        <SafeAreaView style={styles.container} edges={["bottom"]}>
          <ChipBar>
            {REPORT_TYPES.map((t) => (
              <Chip
                key={t.value}
                label={t.label}
                active={type === t.value}
                onPress={() => selectType(t.value)}
              />
            ))}
          </ChipBar>

          {!type ? (
            <EmptyCard title="اختر نوع التقرير" message="اضغط على أحد الأنواع فوق عشان يتولّد التقرير." />
          ) : loading ? (
            <ListSkeleton rows={3} />
          ) : error ? (
            <ErrorCard message={error} onRetry={() => selectType(type)} />
          ) : report ? (
            <ScrollView contentContainerStyle={styles.content}>
              <Text style={styles.reportTitle}>{report.title}</Text>
              <Text style={styles.reportDescription}>{report.description}</Text>
              <Text style={styles.reportMeta}>
                {report.rowCount} صف · اتولّد {new Date(report.generatedAt).toLocaleString("ar-EG")}
              </Text>
              {report.truncated ? <TruncatedNotice rowCount={report.rowCount} totalAvailable={report.totalAvailable} /> : null}
              <ReportTable columns={report.columns} rows={report.rows} />
            </ScrollView>
          ) : null}
        </SafeAreaView>
      </PermissionGate>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingTop: 4, gap: 10 },
  reportTitle: { fontSize: type.title.fontSize, fontFamily: "Alexandria_700Bold", color: colors.onSurface },
  reportDescription: { fontSize: type.body.fontSize, fontFamily: "Cairo_400Regular", color: colors.onSurfaceVariant },
  reportMeta: { fontSize: type.caption.fontSize, fontFamily: "Cairo_500Medium", color: colors.outline },
});
