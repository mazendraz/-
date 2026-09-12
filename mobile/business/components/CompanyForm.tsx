import { useState } from "react";
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import type { ApiAdminCategory } from "@alassema/core";
import { colors, type } from "@alassema/core";
import { rowStart, textStart } from "@alassema/mobile-shared";
import type { CompanyInput } from "../lib/adminCompanies";
import { MAX_CATEGORIES_PER_COMPANY } from "../lib/adminCompanies";
import GalleryManager from "./GalleryManager";
import CategoryMultiSelect from "./CategoryMultiSelect";
import MediaPicker from "./MediaPicker";
import { uploadAdminImage } from "../lib/adminUpload";

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


  return (
    <View style={styles.wrap}>
      <Field label={`التصنيفات (حتى ${MAX_CATEGORIES_PER_COMPANY})`}>
        {/* Same model as the website's CategoryMultiSelect — see that
            component's own header for why the old "every category as a chip"
            grid had to go. */}
        <CategoryMultiSelect
          categories={categories}
          selectedIds={value.categoryIds}
          primaryId={value.primaryCategoryId}
          max={MAX_CATEGORIES_PER_COMPANY}
          onChange={(next) =>
            onChange({
              ...value,
              categoryIds: next.categoryIds,
              // CompanyInput models "no primary" as absent, not null.
              primaryCategoryId: next.primaryCategoryId ?? undefined,
            })
          }
        />
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

      {/* Real uploaders, not URL boxes. These two fields used to be plain text
          inputs asking for an image URL — unusable on the device that actually
          holds the picture.

          `clearable={false}`: both columns are required (schema.prisma, and
          `imageRef` in validation/shared.ts), so Remove wrote "" and the save
          came straight back a 400. See MediaPicker's own note. */}
      <MediaPicker
        label="اللوجو"
        shape="logo"
        value={value.logo}
        onChange={(v) => set("logo", v)}
        upload={(file) => uploadAdminImage("logos", file)}
        clearable={false}
      />
      <MediaPicker
        label="صورة الغلاف"
        shape="cover"
        value={value.cover}
        onChange={(v) => set("cover", v)}
        upload={(file) => uploadAdminImage("covers", file)}
        clearable={false}
      />

      <Field label="معرض الصور والفيديو">
        <GalleryManager
          images={value.gallery}
          onChange={(v) => set("gallery", v)}
          upload={(file) => uploadAdminImage("gallery", file)}
        />
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
    backgroundColor: colors.surfaceContainerLowest,
    textAlign: textStart,
  },
  textArea: { minHeight: 80, textAlignVertical: "top" },
  formRow: { flexDirection: rowStart, gap: 10 },
  tagRow: { flexDirection: rowStart, flexWrap: "wrap", gap: 8 },
  tag: { backgroundColor: colors.secondaryContainer, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  tagText: { fontSize: type.caption.fontSize, fontFamily: "Cairo_600SemiBold", color: colors.onSecondaryContainer },
  tagAddRow: { flexDirection: rowStart, gap: 8, marginTop: 4 },
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
  switchRow: { flexDirection: rowStart, alignItems: "center", justifyContent: "space-between", backgroundColor: colors.surfaceContainer, borderRadius: 12, padding: 12 },
});
