import { useState } from "react";
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import type { ApiAdminCategory } from "@alassema/core";
import { colors, type } from "@alassema/core";
import { textStart } from "@alassema/mobile-shared";
import type { CompanyInput } from "../lib/adminCompanies";
import { MAX_CATEGORIES_PER_COMPANY } from "../lib/adminCompanies";
import GalleryManager from "./GalleryManager";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

function TagList({ label, hint, values, onChange }: { label: string; hint?: string; values: string[]; onChange: (next: string[]) => void }) {
  const [draft, setDraft] = useState("");
  function add() {
    const v = draft.trim();
    if (!v || values.includes(v)) return;
    onChange([...values, v]);
    setDraft("");
  }
  return (
    <Field label={label}>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      <View style={styles.tagRow}>
        {values.map((v) => (
          <Pressable key={v} style={styles.tag} onPress={() => onChange(values.filter((x) => x !== v))}>
            <Text style={styles.tagText}>{v} ✕</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.tagAddRow}>
        <TextInput
          style={[styles.input, styles.tagInput]}
          value={draft}
          onChangeText={setDraft}
          placeholder="اكتب وسيب فراغ..."
          placeholderTextColor={colors.onSurfaceVariant}
          onSubmitEditing={add}
        />
        <Pressable style={styles.tagAddBtn} onPress={add}>
          <Text style={styles.tagAddText}>إضافة</Text>
        </Pressable>
      </View>
    </Field>
  );
}

/**
 * Every field `upsertCompanySchema` accepts, in one controlled component —
 * the screen owns `value`/`onChange` and builds the full-representation
 * body from it on save (never a partial patch — see phase-10's own PUT-
 * blanks-fields risk note).
 */
export default function CompanyForm({
  value,
  onChange,
  categories,
}: {
  value: CompanyInput;
  onChange: (next: CompanyInput) => void;
  categories: ApiAdminCategory[];
}) {
  function set<K extends keyof CompanyInput>(key: K, v: CompanyInput[K]) {
    onChange({ ...value, [key]: v });
  }

  function toggleCategory(id: string) {
    const selected = value.categoryIds.includes(id);
    if (selected) {
      const nextIds = value.categoryIds.filter((c) => c !== id);
      const nextPrimary = value.primaryCategoryId === id ? nextIds[0] : value.primaryCategoryId;
      onChange({ ...value, categoryIds: nextIds, primaryCategoryId: nextPrimary });
    } else {
      if (value.categoryIds.length >= MAX_CATEGORIES_PER_COMPANY) return;
      onChange({ ...value, categoryIds: [...value.categoryIds, id], primaryCategoryId: value.primaryCategoryId ?? id });
    }
  }

  return (
    <View style={styles.wrap}>
      <Field label={`التصنيفات (حتى ${MAX_CATEGORIES_PER_COMPANY})`}>
        <Text style={styles.hint}>اضغط تاني على المختار عشان تخليه التصنيف الأساسي.</Text>
        <View style={styles.tagRow}>
          {categories.map((c) => {
            const selected = value.categoryIds.includes(c.id);
            const primary = value.primaryCategoryId === c.id;
            return (
              <Pressable
                key={c.id}
                style={[styles.categoryChip, selected && styles.categoryChipActive, primary && styles.categoryChipPrimary]}
                onPress={() => (selected ? set("primaryCategoryId", c.id) : toggleCategory(c.id))}
                onLongPress={() => toggleCategory(c.id)}
              >
                <Text style={[styles.categoryChipText, selected && styles.categoryChipTextActive, primary && styles.categoryChipTextPrimary]}>
                  {c.label}{primary ? " ★" : ""}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {value.categoryIds.map((id) => (
          <Pressable key={id} style={styles.removeCategoryBtn} onPress={() => toggleCategory(id)}>
            <Text style={styles.removeCategoryText}>إزالة {categories.find((c) => c.id === id)?.label ?? id}</Text>
          </Pressable>
        ))}
      </Field>

      <Field label="الاسم">
        <TextInput style={styles.input} value={value.name} onChangeText={(v) => set("name", v)} placeholderTextColor={colors.onSurfaceVariant} />
      </Field>
      <Field label="الاسم بالعربي (اختياري)">
        <TextInput style={styles.input} value={value.nameAr ?? ""} onChangeText={(v) => set("nameAr", v || null)} placeholderTextColor={colors.onSurfaceVariant} />
      </Field>
      <Field label="الشعار (Tagline)">
        <TextInput style={styles.input} value={value.tagline} onChangeText={(v) => set("tagline", v)} placeholderTextColor={colors.onSurfaceVariant} />
      </Field>
      <Field label="نبذة">
        <TextInput style={[styles.input, styles.textArea]} value={value.about} onChangeText={(v) => set("about", v)} multiline placeholderTextColor={colors.onSurfaceVariant} />
      </Field>

      <Field label="اللوجو (رابط الصورة)">
        <TextInput style={styles.input} value={value.logo} onChangeText={(v) => set("logo", v)} placeholderTextColor={colors.onSurfaceVariant} />
      </Field>
      <Field label="صورة الغلاف (رابط الصورة)">
        <TextInput style={styles.input} value={value.cover} onChangeText={(v) => set("cover", v)} placeholderTextColor={colors.onSurfaceVariant} />
      </Field>

      <Field label="معرض الصور">
        <GalleryManager images={value.gallery} onChange={(v) => set("gallery", v)} />
      </Field>

      <TagList label="الخدمات المعروضة" values={value.services} onChange={(v) => set("services", v)} />
      <TagList label="الشارات" values={value.badges} onChange={(v) => set("badges", v)} />

      <Field label="الهاتف">
        <TextInput style={styles.input} value={value.phone} onChangeText={(v) => set("phone", v)} keyboardType="phone-pad" placeholderTextColor={colors.onSurfaceVariant} />
      </Field>
      <Field label="واتساب (اختياري)">
        <TextInput style={styles.input} value={value.whatsapp ?? ""} onChangeText={(v) => set("whatsapp", v || null)} keyboardType="phone-pad" placeholderTextColor={colors.onSurfaceVariant} />
      </Field>
      <Field label="البريد الإلكتروني (اختياري)">
        <TextInput style={styles.input} value={value.email ?? ""} onChangeText={(v) => set("email", v || null)} keyboardType="email-address" autoCapitalize="none" placeholderTextColor={colors.onSurfaceVariant} />
      </Field>
      <Field label="الموقع / الحي">
        <TextInput style={styles.input} value={value.location} onChangeText={(v) => set("location", v)} placeholderTextColor={colors.onSurfaceVariant} />
      </Field>
      <Field label="سنوات الخبرة">
        <TextInput style={styles.input} value={String(value.yearsExperience)} onChangeText={(v) => set("yearsExperience", Number(v.replace(/[^0-9]/g, "")) || 0)} keyboardType="number-pad" placeholderTextColor={colors.onSurfaceVariant} />
      </Field>
      <Field label="مدة الرد">
        <TextInput style={styles.input} value={value.responseTime} onChangeText={(v) => set("responseTime", v)} placeholderTextColor={colors.onSurfaceVariant} />
      </Field>
      <Field label="موثّق منذ">
        <TextInput style={styles.input} value={value.verifiedSince} onChangeText={(v) => set("verifiedSince", v)} placeholderTextColor={colors.onSurfaceVariant} />
      </Field>

      <View style={styles.switchRow}>
        <Text style={styles.label}>مميّز (Featured)</Text>
        <Switch value={value.featured ?? false} onValueChange={(v) => set("featured", v)} />
      </View>
      <View style={styles.switchRow}>
        <Text style={styles.label}>موثّق (Verified)</Text>
        <Switch value={value.verified ?? false} onValueChange={(v) => set("verified", v)} />
      </View>
      <View style={styles.switchRow}>
        <Text style={styles.label}>تقييم يدوي (تجاوز التقييمات الحقيقية)</Text>
        <Switch value={value.ratingOverridden ?? false} onValueChange={(v) => set("ratingOverridden", v)} />
      </View>
      {value.ratingOverridden ? (
        <View style={styles.formRow}>
          <Field label="التقييم (0-5)">
            <TextInput style={styles.input} value={String(value.rating ?? 0)} onChangeText={(v) => set("rating", Number(v) || 0)} keyboardType="decimal-pad" placeholderTextColor={colors.onSurfaceVariant} />
          </Field>
          <Field label="عدد التقييمات">
            <TextInput style={styles.input} value={String(value.reviewCount ?? 0)} onChangeText={(v) => set("reviewCount", Number(v.replace(/[^0-9]/g, "")) || 0)} keyboardType="number-pad" placeholderTextColor={colors.onSurfaceVariant} />
          </Field>
        </View>
      ) : null}

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
  hint: { fontSize: type.caption.fontSize, fontFamily: "Cairo_400Regular", color: colors.onSurfaceVariant, textAlign: textStart },
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
  textArea: { minHeight: 80, textAlignVertical: "top" },
  formRow: { flexDirection: "row-reverse", gap: 10 },
  tagRow: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8 },
  tag: { backgroundColor: colors.secondaryContainer, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  tagText: { fontSize: type.caption.fontSize, fontFamily: "Cairo_600SemiBold", color: colors.onSecondaryContainer },
  tagAddRow: { flexDirection: "row-reverse", gap: 8, marginTop: 4 },
  tagInput: { flex: 1 },
  tagAddBtn: { backgroundColor: colors.surfaceContainer, borderRadius: 10, paddingHorizontal: 16, justifyContent: "center" },
  tagAddText: { fontFamily: "Cairo_600SemiBold", fontSize: type.label.fontSize, color: colors.onSurface },
  categoryChip: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: colors.surfaceContainer },
  categoryChipActive: { backgroundColor: colors.primaryContainer },
  categoryChipPrimary: { backgroundColor: colors.primary },
  categoryChipText: { fontSize: type.caption.fontSize, fontFamily: "Cairo_600SemiBold", color: colors.onSurfaceVariant },
  categoryChipTextActive: { color: colors.onPrimaryContainer },
  categoryChipTextPrimary: { color: colors.onPrimary },
  removeCategoryBtn: { alignSelf: "flex-start", marginTop: 2 },
  removeCategoryText: { fontSize: type.caption.fontSize, fontFamily: "Cairo_500Medium", color: colors.error },
  switchRow: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", backgroundColor: colors.surfaceContainer, borderRadius: 12, padding: 12 },
});
