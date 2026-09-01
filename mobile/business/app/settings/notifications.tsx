import { useEffect, useState } from "react";
import { StyleSheet, Switch, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack } from "expo-router";
import { ApiError, textStart } from "@alassema/mobile-shared";
import { colors, type } from "@alassema/core";
import { fetchAdminNotificationSettings, setAdminChatNotifyEnabled } from "../../lib/adminSettings";
import { ListSkeleton, ErrorCard } from "../../components/ListStates";

export default function NotificationSettings() {
  const [chatEnabled, setChatEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchAdminNotificationSettings()
      .then((res) => setChatEnabled(res.chatEnabled))
      .catch((err) => setError(err instanceof ApiError ? err.message : "تعذّر تحميل الإعدادات."))
      .finally(() => setLoading(false));
  }, []);

  async function toggle(next: boolean) {
    if (saving) return;
    setChatEnabled(next);
    setSaving(true);
    try {
      const res = await setAdminChatNotifyEnabled(next);
      setChatEnabled(res.chatEnabled);
    } catch (err) {
      setChatEnabled(!next);
      setError(err instanceof ApiError ? err.message : "تعذّر الحفظ.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "إشعارات الأدمن" }} />
      <SafeAreaView style={styles.container} edges={["bottom"]}>
        {loading ? (
          <ListSkeleton rows={1} />
        ) : (
          <View style={styles.content}>
            <View style={styles.row}>
              <View style={styles.rowText}>
                <Text style={styles.label}>تنبيهات رسائل العملاء</Text>
                <Text style={styles.hint}>
                  {chatEnabled ? "هتوصلك رسالة لكل رسالة عميل جديدة." : "مش هتوصلك تنبيهات رسائل — لسه بتوصل تنبيهات الطلبات الجديدة عادي."}
                </Text>
              </View>
              <Switch value={chatEnabled} onValueChange={toggle} disabled={saving} />
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
