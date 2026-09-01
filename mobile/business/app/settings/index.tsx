import { useEffect, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, Stack } from "expo-router";
import type { ApiPlatformSettings } from "@alassema/core";
import { ApiError, textStart } from "@alassema/mobile-shared";
import { colors, type } from "@alassema/core";
import { fetchPlatformSettings, updatePlatformSettings } from "../../lib/adminSettings";
import Button from "../../components/Button";
import CompanySectionNav from "../../components/CompanySectionNav";
import { ListSkeleton, ErrorCard } from "../../components/ListStates";

const FIELDS: { key: keyof ApiPlatformSettings; label: string; multiline?: boolean }[] = [
  { key: "site_name", label: "اسم الموقع" },
  { key: "support_email", label: "بريد الدعم الفني" },
  { key: "public_phone", label: "رقم الهاتف العام" },
  { key: "address", label: "العنوان" },
  { key: "social_facebook", label: "فيسبوك (رابط)" },
  { key: "social_instagram", label: "إنستجرام (رابط)" },
  { key: "social_twitter", label: "تويتر/X (رابط)" },
  { key: "social_linkedin", label: "لينكدإن (رابط)" },
  { key: "districts", label: "قائمة الأحياء (سطر لكل حي)", multiline: true },
  { key: "budgets", label: "قائمة الميزانيات (سطر لكل خيار)", multiline: true },
  { key: "hero_title_en", label: "عنوان الصفحة الرئيسية (إنجليزي)" },
  { key: "hero_title_ar", label: "عنوان الصفحة الرئيسية (عربي)" },
  { key: "hero_subtitle_en", label: "العنوان الفرعي (إنجليزي)" },
  { key: "hero_subtitle_ar", label: "العنوان الفرعي (عربي)" },
  { key: "logo_url", label: "رابط اللوجو" },
  { key: "favicon_url", label: "رابط الأيقونة (Favicon)" },
  { key: "logo_scale", label: "حجم اللوجو % (50-200، فاضي = 100%)" },
  { key: "hero_image_url", label: "صورة خلفية الصفحة الرئيسية" },
];

export default function PlatformSettings() {
  const [value, setValue] = useState<ApiPlatformSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchPlatformSettings()
      .then(setValue)
      .catch((err) => setError(err instanceof ApiError ? err.message : "تعذّر تحميل الإعدادات."))
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    if (!value || saving) return;
    setSaving(true);
    try {
      const updated = await updatePlatformSettings(value);
      setValue(updated);
      Alert.alert("تم الحفظ", "اتحفظت إعدادات المنصة.");
    } catch (err) {
      Alert.alert("خطأ", err instanceof ApiError ? err.message : "تعذّر الحفظ. جرّب تاني.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "إعدادات المنصة" }} />
      <SafeAreaView style={styles.container} edges={["bottom"]}>
        {loading ? (
          <ListSkeleton rows={4} />
        ) : error ? (
          <ErrorCard message={error} />
        ) : value ? (
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <CompanySectionNav
              sections={[
                { label: "وضع الصيانة", onPress: () => router.push("/settings/maintenance") },
                { label: "إشعارات الأدمن", onPress: () => router.push("/settings/notifications") },
                { label: "تليجرام", onPress: () => router.push("/settings/telegram") },
              ]}
            />

            {FIELDS.map((f) => (
              <View key={f.key}>
                <Text style={styles.label}>{f.label}</Text>
                <TextInput
                  style={[styles.input, f.multiline && styles.textArea]}
                  value={value[f.key]}
                  onChangeText={(v) => setValue({ ...value, [f.key]: v })}
                  multiline={f.multiline}
                  placeholderTextColor={colors.onSurfaceVariant}
                />
              </View>
            ))}

            <Button label={saving ? "بيتحفظ..." : "حفظ"} onPress={handleSave} busy={saving} />
          </ScrollView>
        ) : null}
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, gap: 16, paddingBottom: 40 },
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
