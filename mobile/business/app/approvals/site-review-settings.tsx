import { useEffect, useState } from "react";
import { StyleSheet, Switch, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack } from "expo-router";
import { ApiError, textStart } from "@alassema/mobile-shared";
import { colors, type } from "@alassema/core";
import { fetchSiteReviewSettings, setSiteReviewSettings } from "../../lib/approvals";
import { ListSkeleton, ErrorCard } from "../../components/ListStates";

export default function SiteReviewSettings() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchSiteReviewSettings()
      .then((res) => setEnabled(res.enabled))
      .catch((err) => setError(err instanceof ApiError ? err.message : "تعذّر تحميل الإعدادات."))
      .finally(() => setLoading(false));
  }, []);

  async function toggle(next: boolean) {
    if (saving) return;
    setEnabled(next);
    setSaving(true);
    try {
      const res = await setSiteReviewSettings(next);
      setEnabled(res.enabled);
    } catch (err) {
      setEnabled(!next);
      setError(err instanceof ApiError ? err.message : "تعذّر الحفظ.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "إعدادات آراء العملاء" }} />
      <SafeAreaView style={styles.container} edges={["bottom"]}>
        {loading ? (
          <ListSkeleton rows={1} />
        ) : (
          <View style={styles.content}>
            <View style={styles.row}>
              <View style={styles.rowText}>
                <Text style={styles.label}>استقبال آراء جديدة</Text>
                <Text style={styles.hint}>
                  {enabled ? "الفورم شغّالة — أي حد يقدر يبعت رأي جديد." : "الفورم مقفولة — مفيش آراء جديدة هتتبعت."}
                </Text>
              </View>
              <Switch value={enabled ?? false} onValueChange={toggle} disabled={saving} />
            </View>
            {error ? <ErrorCard message={error} /> : null}
          </View>
        )}
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, gap: 12 },
  row: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surfaceContainer,
    borderRadius: 14,
    padding: 16,
    gap: 12,
  },
  rowText: { flex: 1, gap: 4 },
  label: { fontSize: type.body.fontSize, fontFamily: "Cairo_700Bold", color: colors.onSurface, textAlign: textStart },
  hint: { fontSize: type.caption.fontSize, fontFamily: "Cairo_400Regular", color: colors.onSurfaceVariant, textAlign: textStart, lineHeight: 18 },
});
