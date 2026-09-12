import { useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, Stack } from "expo-router";
import type { ApiPlatformSettings } from "@alassema/core";
import { ApiError, rowStart, textStart } from "@alassema/mobile-shared";
import { colors, type } from "@alassema/core";
import { fetchPlatformSettings, updatePlatformSettings } from "../../lib/adminSettings";
import { uploadAdminImage } from "../../lib/adminUpload";
import Button from "../../components/Button";
import CompanySectionNav from "../../components/CompanySectionNav";
import { ListSkeleton, ErrorCard } from "../../components/ListStates";
import FormScroll from "../../components/FormScroll";
import MediaPicker from "../../components/MediaPicker";
import Icon from "../../components/Icon";

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
];

/** 50–200 in steps of 5 — matches the website's own slider (SettingsTab.tsx's
 *  BrandingSettings) and the API's own clamp (validation/settings.ts). */
const SCALE_MIN = 50;
const SCALE_MAX = 200;
const SCALE_STEP = 5;

/**
 * Logo size, as a stepper rather than a bare "type a percentage" box.
 *
 * The website uses an `<input type="range">`, which React Native has no
 * built-in equivalent for — a real drag-slider needs a native module
 * (`@react-native-community/slider`), and this screen isn't worth the native
 * rebuild that would force on everyone's next build. A stepper with a fill
 * bar gets the same "see it, nudge it, can't type something invalid" result
 * with a plain View and two buttons.
 */
function LogoScaleField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const scale = Number(value) || 100;

  function step(delta: number) {
    const next = Math.min(SCALE_MAX, Math.max(SCALE_MIN, scale + delta));
    // "" means 100% (the API default) — writing "100" explicitly would work
    // too, but "" is what a never-touched field already holds.
    onChange(next === 100 ? "" : String(next));
  }

  const fillPct = ((scale - SCALE_MIN) / (SCALE_MAX - SCALE_MIN)) * 100;

  return (
    <View>
      <Text style={styles.label}>{`حجم اللوجو — ${scale}%`}</Text>
      <View style={styles.scaleRow}>
        <Pressable
          onPress={() => step(-SCALE_STEP)}
          disabled={scale <= SCALE_MIN}
          style={({ pressed }) => [styles.scaleBtn, pressed && styles.scaleBtnPressed, scale <= SCALE_MIN && styles.scaleBtnDisabled]}
          accessibilityRole="button"
          accessibilityLabel="تصغير اللوجو"
        >
          <Icon name="remove" size={20} color={colors.onSurface} />
        </Pressable>
        <View style={styles.scaleTrack}>
          <View style={[styles.scaleFill, { width: `${fillPct}%` }]} />
        </View>
        <Pressable
          onPress={() => step(SCALE_STEP)}
          disabled={scale >= SCALE_MAX}
          style={({ pressed }) => [styles.scaleBtn, pressed && styles.scaleBtnPressed, scale >= SCALE_MAX && styles.scaleBtnDisabled]}
          accessibilityRole="button"
          accessibilityLabel="تكبير اللوجو"
        >
          <Icon name="add" size={20} color={colors.onSurface} />
        </Pressable>
      </View>
      {scale !== 100 ? (
        <Pressable onPress={() => onChange("")} hitSlop={6} accessibilityRole="button">
          <Text style={styles.resetLink}>إعادة الضبط لـ 100%</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

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
          <FormScroll contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
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

            {/* Real uploaders, not URL boxes — same MediaPicker the website's
                own provider ImagePicker inspired and CompanyForm already uses
                for a company's logo/cover. All three columns accept "" (see
                ApiPlatformSettings), so Remove is left on. */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>العلامة التجارية</Text>
              <MediaPicker
                label="اللوجو"
                shape="logo"
                value={value.logo_url}
                onChange={(v) => setValue({ ...value, logo_url: v })}
                upload={(file) => uploadAdminImage("logos", file)}
              />
              <MediaPicker
                label="أيقونة المتصفح (Favicon)"
                shape="logo"
                hint="المقاس المناسب: 64×64 بكسل، مربع · لحد 5 ميجا"
                value={value.favicon_url}
                onChange={(v) => setValue({ ...value, favicon_url: v })}
                upload={(file) => uploadAdminImage("logos", file)}
              />
              <LogoScaleField
                value={value.logo_scale}
                onChange={(v) => setValue({ ...value, logo_scale: v })}
              />
              <MediaPicker
                label="صورة خلفية الصفحة الرئيسية"
                shape="cover"
                value={value.hero_image_url}
                onChange={(v) => setValue({ ...value, hero_image_url: v })}
                upload={(file) => uploadAdminImage("covers", file)}
              />
            </View>

            <Button label={saving ? "بيتحفظ..." : "حفظ"} onPress={handleSave} busy={saving} />
          </FormScroll>
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
    backgroundColor: colors.surfaceContainerLowest,
    textAlign: textStart,
  },
  textArea: { minHeight: 70, textAlignVertical: "top" },
  section: {
    gap: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.outlineVariant,
  },
  sectionTitle: {
    fontSize: type.body.fontSize,
    fontFamily: "Cairo_700Bold",
    color: colors.onSurface,
    textAlign: textStart,
  },
  scaleRow: { flexDirection: rowStart, alignItems: "center", gap: 10 },
  scaleBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceContainer,
  },
  scaleBtnPressed: { backgroundColor: colors.surfaceContainerHigh },
  scaleBtnDisabled: { opacity: 0.4 },
  scaleTrack: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.surfaceContainer,
    overflow: "hidden",
  },
  scaleFill: { height: "100%", borderRadius: 4, backgroundColor: colors.primary },
  resetLink: {
    marginTop: 8,
    fontSize: type.caption.fontSize,
    fontFamily: "Cairo_600SemiBold",
    color: colors.outline,
    textDecorationLine: "underline",
    textAlign: textStart,
  },
});
