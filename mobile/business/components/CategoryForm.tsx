import { Switch, TextInput, View, Text, StyleSheet } from "react-native";
import { colors, type } from "@alassema/core";
import { textStart } from "@alassema/mobile-shared";
import type { CategoryInput } from "../lib/adminCategories";
import PricingModeSelector from "./PricingModeSelector";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

export default function CategoryForm({
  value,
  onChange,
  publishedOfferingCompanyCount,
}: {
  value: CategoryInput;
  onChange: (next: CategoryInput) => void;
  publishedOfferingCompanyCount: number;
}) {
  function set<K extends keyof CategoryInput>(key: K, v: CategoryInput[K]) {
    onChange({ ...value, [key]: v });
  }

  return (
    <View style={styles.wrap}>
      <Field label="الاسم">
        <TextInput style={styles.input} value={value.label} onChangeText={(v) => set("label", v)} placeholderTextColor={colors.onSurfaceVariant} />
      </Field>
      <Field label="الاسم بالعربي (اختياري)">
        <TextInput style={styles.input} value={value.labelAr ?? ""} onChangeText={(v) => set("labelAr", v || null)} placeholderTextColor={colors.onSurfaceVariant} />
      </Field>
      <Field label="الوصف">
        <TextInput style={[styles.input, styles.textArea]} value={value.description} onChangeText={(v) => set("description", v)} multiline placeholderTextColor={colors.onSurfaceVariant} />
      </Field>
      <Field label="الأيقونة">
        <TextInput style={styles.input} value={value.icon} onChangeText={(v) => set("icon", v)} placeholderTextColor={colors.onSurfaceVariant} />
      </Field>

      <Field label="طريقة التسعير">
        <PricingModeSelector value={value.pricingMode} onChange={(v) => set("pricingMode", v)} affectedCompanies={publishedOfferingCompanyCount} />
      </Field>

      <View style={styles.switchRow}>
        <Text style={styles.label}>ظاهرة للعملاء</Text>
        <Switch value={value.isActive} onValueChange={(v) => set("isActive", v)} />
      </View>

      <Field label="عنوان SEO (اختياري)">
        <TextInput style={styles.input} value={value.metaTitle ?? ""} onChangeText={(v) => set("metaTitle", v || null)} placeholderTextColor={colors.onSurfaceVariant} />
      </Field>
      <Field label="وصف SEO (اختياري)">
        <TextInput style={[styles.input, styles.textArea]} value={value.metaDescription ?? ""} onChangeText={(v) => set("metaDescription", v || null)} multiline placeholderTextColor={colors.onSurfaceVariant} />
      </Field>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 16 },
  field: { gap: 6 },
  label: { fontSize: type.label.fontSize, fontFamily: "Cairo_600SemiBold", color: colors.onSurfaceVariant, textAlign: textStart },
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
  switchRow: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", backgroundColor: colors.surfaceContainer, borderRadius: 12, padding: 12 },
});
