import { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack } from "expo-router";
import type { ApiEmailTemplates } from "@alassema/core";
import { ApiError, textStart } from "@alassema/mobile-shared";
import { colors, type } from "@alassema/core";
import { fetchEmailTemplates, updateEmailTemplates } from "../../lib/adminContent";
import Button from "../../components/Button";
import { ListSkeleton, ErrorCard } from "../../components/ListStates";

// api's settings.service.ts EMAIL_TEMPLATE_KEYS comment — the exact tokens
// notifications.service.ts substitutes. Blank template = built-in default.
const TOKENS = ["company", "refNumber", "service", "customer", "phone", "district", "budget", "details", "receivedAt"];

function TemplateField({
  label,
  value,
  onChange,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
}) {
  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, multiline && styles.textArea]}
        value={value}
        onChangeText={onChange}
        multiline={multiline}
        placeholder="فاضي = الرسالة الافتراضية المدمجة"
        placeholderTextColor={colors.onSurfaceVariant}
      />
    </View>
  );
}

export default function EmailTemplates() {
  const [templates, setTemplates] = useState<ApiEmailTemplates | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [focusedField, setFocusedField] = useState<keyof ApiEmailTemplates>("providerBody");

  useEffect(() => {
    fetchEmailTemplates()
      .then(setTemplates)
      .catch((err) => setError(err instanceof ApiError ? err.message : "تعذّر تحميل القوالب."))
      .finally(() => setLoading(false));
  }, []);

  function insertToken(token: string) {
    if (!templates) return;
    setTemplates({ ...templates, [focusedField]: `${templates[focusedField]}{{${token}}}` });
  }

  async function handleSave() {
    if (!templates || saving) return;
    setSaving(true);
    try {
      const updated = await updateEmailTemplates(templates);
      setTemplates(updated);
      Alert.alert("تم الحفظ", "اتحفظت قوالب البريد.");
    } catch (err) {
      Alert.alert("خطأ", err instanceof ApiError ? err.message : "تعذّر الحفظ.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "قوالب البريد الإلكتروني" }} />
      <SafeAreaView style={styles.container} edges={["bottom"]}>
        {loading ? (
          <ListSkeleton rows={3} />
        ) : error ? (
          <ErrorCard message={error} />
        ) : templates ? (
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <View style={styles.tokenBar}>
              <Text style={styles.tokenHint}>اضغط لإضافة متغيّر في آخر حقل ركّزت عليه:</Text>
              <View style={styles.tokenRow}>
                {TOKENS.map((t) => (
                  <Pressable key={t} style={styles.tokenChip} onPress={() => insertToken(t)}>
                    <Text style={styles.tokenChipText}>{`{{${t}}}`}</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <Text style={styles.sectionTitle}>رسالة مقدّم الخدمة (طلب جديد)</Text>
            <View onTouchStart={() => setFocusedField("providerSubject")}>
              <TemplateField label="العنوان" value={templates.providerSubject} onChange={(v) => setTemplates({ ...templates, providerSubject: v })} />
            </View>
            <View onTouchStart={() => setFocusedField("providerBody")}>
              <TemplateField label="النص" value={templates.providerBody} onChange={(v) => setTemplates({ ...templates, providerBody: v })} multiline />
            </View>

            <Text style={styles.sectionTitle}>رسالة الأدمن (طلب جديد)</Text>
            <View onTouchStart={() => setFocusedField("adminSubject")}>
              <TemplateField label="العنوان" value={templates.adminSubject} onChange={(v) => setTemplates({ ...templates, adminSubject: v })} />
            </View>
            <View onTouchStart={() => setFocusedField("adminBody")}>
              <TemplateField label="النص" value={templates.adminBody} onChange={(v) => setTemplates({ ...templates, adminBody: v })} multiline />
            </View>

            <Button label={saving ? "بيتحفظ..." : "حفظ"} onPress={handleSave} busy={saving} />
          </ScrollView>
        ) : null}
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, gap: 14, paddingBottom: 40 },
  tokenBar: { backgroundColor: colors.surfaceContainer, borderRadius: 12, padding: 12, gap: 8 },
  tokenHint: { fontSize: type.caption.fontSize, fontFamily: "Cairo_500Medium", color: colors.onSurfaceVariant, textAlign: textStart },
  tokenRow: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 6 },
  tokenChip: { backgroundColor: colors.primaryContainer, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  tokenChipText: { fontSize: 11, fontFamily: "Cairo_700Bold", color: colors.onPrimaryContainer },
  sectionTitle: { fontSize: type.title.fontSize, fontFamily: "Alexandria_700Bold", color: colors.onSurface, marginTop: 4 },
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
  textArea: { minHeight: 100, textAlignVertical: "top" },
});
