import { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useLocalSearchParams } from "expo-router";
import { ApiError, textStart } from "@alassema/mobile-shared";
import { colors, type } from "@alassema/core";
import { fetchCompanyDetail, setCompanyStatus, type CompanyStatusValue } from "../../../lib/adminCompanies";
import { ListSkeleton, ErrorCard } from "../../../components/ListStates";

// ApiCompany doesn't serialize `status` (see phase-8's own correction), so
// this screen can't show the CURRENT status — only set a new one. Confirmed
// against companiesService.setStatus: there is genuinely nowhere else to
// read it from either.
const OPTIONS: { value: CompanyStatusValue; label: string; consequence: string; tone: "ok" | "warn" | "danger" }[] = [
  { value: "ACTIVE", label: "نشطة", consequence: "تظهر في الموقع وتقدر تستقبل طلبات.", tone: "ok" },
  { value: "INACTIVE", label: "غير نشطة", consequence: "تختفي من الموقع العام. حساب مقدّم الخدمة يفضل شغّال.", tone: "warn" },
  { value: "SUSPENDED", label: "موقوفة", consequence: "تختفي من الموقع العام — استخدمها في حالة مخالفة أو شكوى.", tone: "danger" },
];

export default function CompanyStatusScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [companyName, setCompanyName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<CompanyStatusValue | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setError(null);
    try {
      const company = await fetchCompanyDetail(id);
      if (!company) throw new ApiError(404, "الشركة مش لاقيها.");
      setCompanyName(company.name);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "تعذّر تحميل بيانات الشركة.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  function apply(option: (typeof OPTIONS)[number]) {
    if (!id) return;
    Alert.alert(
      `تغيير الحالة إلى "${option.label}"`,
      option.consequence,
      [
        { text: "إلغاء", style: "cancel" },
        {
          text: "تأكيد",
          style: option.tone === "danger" ? "destructive" : "default",
          onPress: async () => {
            setBusy(option.value);
            try {
              await setCompanyStatus(id, option.value);
              Alert.alert("تم", `الحالة اتغيّرت لـ ${option.label}.`);
            } catch (err) {
              Alert.alert("خطأ", err instanceof ApiError ? err.message : "تعذّر التحديث.");
            } finally {
              setBusy(null);
            }
          },
        },
      ],
    );
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: `حالة ${companyName}` }} />
      <SafeAreaView style={styles.container} edges={["bottom"]}>
        {loading ? (
          <ListSkeleton rows={2} />
        ) : error ? (
          <ErrorCard message={error} onRetry={load} />
        ) : (
          <View style={styles.content}>
            {OPTIONS.map((o) => (
              <Pressable key={o.value} style={styles.option} disabled={busy !== null} onPress={() => apply(o)}>
                <Text style={styles.optionLabel}>{busy === o.value ? "..." : o.label}</Text>
                <Text style={styles.optionConsequence}>{o.consequence}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, gap: 10 },
  option: { backgroundColor: colors.surfaceContainer, borderRadius: 14, padding: 16, gap: 4 },
  optionLabel: { fontSize: type.body.fontSize, fontFamily: "Cairo_700Bold", color: colors.onSurface, textAlign: textStart },
  optionConsequence: { fontSize: type.caption.fontSize, fontFamily: "Cairo_400Regular", color: colors.onSurfaceVariant, textAlign: textStart, lineHeight: 18 },
});
