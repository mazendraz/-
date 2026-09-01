import { useEffect, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack } from "expo-router";
import type { ApiMaintenanceStatus } from "@alassema/core";
import { ApiError, textStart } from "@alassema/mobile-shared";
import { colors, type } from "@alassema/core";
import { fetchMaintenanceStatus, updateMaintenanceStatus } from "../../lib/adminSettings";
import Button from "../../components/Button";
import DangerConfirm from "../../components/DangerConfirm";
import { ListSkeleton, ErrorCard } from "../../components/ListStates";

export default function Maintenance() {
  const [status, setStatus] = useState<ApiMaintenanceStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmVisible, setConfirmVisible] = useState(false);

  useEffect(() => {
    fetchMaintenanceStatus()
      .then(setStatus)
      .catch((err) => setError(err instanceof ApiError ? err.message : "تعذّر تحميل الحالة."))
      .finally(() => setLoading(false));
  }, []);

  async function toggle(enabled: boolean) {
    setSaving(true);
    try {
      const updated = await updateMaintenanceStatus({ enabled });
      setStatus(updated);
      setConfirmVisible(false);
    } catch (err) {
      Alert.alert("خطأ", err instanceof ApiError ? err.message : "تعذّر التحديث.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveText() {
    if (!status || saving) return;
    setSaving(true);
    try {
      const updated = await updateMaintenanceStatus({
        title_en: status.title_en, title_ar: status.title_ar,
        message_en: status.message_en, message_ar: status.message_ar,
      });
      setStatus(updated);
      Alert.alert("تم الحفظ", "اتحفظت رسالة الصيانة.");
    } catch (err) {
      Alert.alert("خطأ", err instanceof ApiError ? err.message : "تعذّر الحفظ.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "وضع الصيانة" }} />
      <SafeAreaView style={styles.container} edges={["bottom"]}>
        {loading ? (
          <ListSkeleton rows={3} />
        ) : error ? (
          <ErrorCard message={error} />
        ) : status ? (
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <View style={[styles.statusCard, status.enabled ? styles.statusOn : styles.statusOff]}>
              <Text style={styles.statusTitle}>{status.enabled ? "الموقع في وضع الصيانة" : "الموقع شغّال عادي"}</Text>
              <Text style={styles.statusSubtitle}>
                {status.enabled ? "العملاء بيشوفوا شاشة الصيانة بدل الموقع." : "العملاء بيقدروا يستخدموا الموقع عادي."}
              </Text>
            </View>

            <Button
              label={status.enabled ? "إيقاف وضع الصيانة" : "تفعيل وضع الصيانة"}
              variant={status.enabled ? "secondary" : "danger"}
              busy={saving}
              onPress={() => (status.enabled ? toggle(false) : setConfirmVisible(true))}
            />

            <Text style={styles.sectionTitle}>رسالة الصيانة</Text>
            <View>
              <Text style={styles.label}>العنوان (عربي)</Text>
              <TextInput style={styles.input} value={status.title_ar} onChangeText={(v) => setStatus({ ...status, title_ar: v })} placeholderTextColor={colors.onSurfaceVariant} />
            </View>
            <View>
              <Text style={styles.label}>العنوان (إنجليزي)</Text>
              <TextInput style={styles.input} value={status.title_en} onChangeText={(v) => setStatus({ ...status, title_en: v })} placeholderTextColor={colors.onSurfaceVariant} />
            </View>
            <View>
              <Text style={styles.label}>الرسالة (عربي)</Text>
              <TextInput style={[styles.input, styles.textArea]} value={status.message_ar} onChangeText={(v) => setStatus({ ...status, message_ar: v })} multiline placeholderTextColor={colors.onSurfaceVariant} />
            </View>
            <View>
              <Text style={styles.label}>الرسالة (إنجليزي)</Text>
              <TextInput style={[styles.input, styles.textArea]} value={status.message_en} onChangeText={(v) => setStatus({ ...status, message_en: v })} multiline placeholderTextColor={colors.onSurfaceVariant} />
            </View>

            <Button label={saving ? "بيتحفظ..." : "حفظ الرسالة"} onPress={handleSaveText} busy={saving} />
          </ScrollView>
        ) : null}

        <DangerConfirm
          visible={confirmVisible}
          title="تفعيل وضع الصيانة"
          consequence="الموقع كله هيتقفل قدام العملاء فورًا، وهيشوفوا شاشة الصيانة بدل أي صفحة. لوحات الأدمن ومقدّمي الخدمة بتفضل شغّالة عادي."
          confirmPhrase="صيانة"
          confirmLabel="تفعيل الصيانة"
          busy={saving}
          onConfirm={() => toggle(true)}
          onClose={() => setConfirmVisible(false)}
        />
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, gap: 16, paddingBottom: 40 },
  statusCard: { borderRadius: 14, padding: 16, gap: 4 },
  statusOn: { backgroundColor: colors.errorContainer },
  statusOff: { backgroundColor: colors.successContainer },
  statusTitle: { fontSize: type.title.fontSize, fontFamily: "Alexandria_700Bold", color: colors.onSurface, textAlign: textStart },
  statusSubtitle: { fontSize: type.caption.fontSize, fontFamily: "Cairo_400Regular", color: colors.onSurfaceVariant, textAlign: textStart },
  sectionTitle: { fontSize: type.title.fontSize, fontFamily: "Alexandria_700Bold", color: colors.onSurface, marginTop: 8 },
  label: { fontSize: type.label.fontSize, fontFamily: "Cairo_600SemiBold", color: colors.onSurfaceVariant, marginBottom: 6, textAlign: textStart },
  input: {
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: type.body.fontSize,
    fontFamily: "Cairo_400Regular",
    color: colors.onSurface,
    backgroundColor: colors.surface,
    textAlign: textStart,
  },
  textArea: { minHeight: 70, textAlignVertical: "top" },
});
