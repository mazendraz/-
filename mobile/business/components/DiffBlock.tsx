import { StyleSheet, Text, View } from "react-native";
import { colors, type } from "@alassema/core";
import { textStart } from "@alassema/mobile-shared";
import type { ChangeEntity } from "../lib/profile";

/** api's changeRequests.service.ts EDITABLE_FIELDS labels, mirrored per
 *  entity kind — the same field can mean different things on different
 *  entities (e.g. OFFERING has no `location`), so this is keyed by entity,
 *  not one flat map. */
const FIELD_LABELS: Record<ChangeEntity, Record<string, string>> = {
  COMPANY: {
    name: "الاسم", nameAr: "الاسم بالعربي", tagline: "الشعار", about: "نبذة",
    logo: "الشعار (صورة)", cover: "صورة الغلاف", gallery: "معرض الصور",
    phone: "الهاتف", whatsapp: "واتساب", email: "البريد الإلكتروني", location: "الموقع",
    yearsExperience: "سنوات الخبرة", responseTime: "مدة الرد", badges: "الشارات",
    metaTitle: "عنوان SEO", metaDescription: "وصف SEO",
  },
  OFFERING: {
    name: "الاسم", nameAr: "الاسم بالعربي", description: "الوصف", descriptionAr: "الوصف بالعربي",
    tags: "كلمات مفتاحية", kind: "النوع", pricingModel: "طريقة التسعير",
    priceMin: "السعر (من)", priceMax: "السعر (لحد)", unit: "الوحدة", minQty: "أقل كمية",
    image: "صورة", note: "ملاحظة",
  },
  OFFERING_TIER: {
    label: "اسم الفئة", qtyMin: "الكمية (من)", qtyMax: "الكمية (لحد)",
    priceMin: "السعر (من)", priceMax: "السعر (لحد)",
  },
  BUNDLE_RULE: {
    label: "اسم القاعدة", minItems: "عدد الخدمات", discountPercent: "نسبة الخصم",
  },
};

function fieldLabel(entity: ChangeEntity, key: string): string {
  return FIELD_LABELS[entity][key] ?? key;
}

function formatValue(value: unknown): string {
  if (value == null || value === "") return "—";
  if (Array.isArray(value)) return value.length > 0 ? value.map(String).join("، ") : "—";
  if (typeof value === "boolean") return value ? "نعم" : "لا";
  return String(value);
}

/**
 * Before/after per field, the one component that makes a change request
 * actually reviewable — see phase-9's own note that this earns its keep.
 * `changes` is the requested new values; `snapshot` is what the field held
 * at submission time. A PUBLISH request's `changes` is often empty (nothing
 * is being edited, just made public), so a field present only in `snapshot`
 * still renders — as "no change, shown for context" (same value both sides).
 */
export default function DiffBlock({
  entity,
  changes,
  snapshot,
  conflicts,
}: {
  entity: ChangeEntity;
  changes: Record<string, unknown>;
  snapshot: Record<string, unknown>;
  conflicts?: string[];
}) {
  const keys = Array.from(new Set([...Object.keys(snapshot), ...Object.keys(changes)]));
  const conflictSet = new Set(conflicts ?? []);

  if (keys.length === 0) {
    return <Text style={styles.empty}>لا يوجد تفاصيل تغيير لعرضها.</Text>;
  }

  return (
    <View style={styles.wrap}>
      {keys.map((key) => {
        const before = snapshot[key];
        const hasChange = key in changes;
        const after = hasChange ? changes[key] : before;
        const changed = hasChange && !valuesEqual(before, after);
        const isConflict = conflictSet.has(key);

        return (
          <View key={key} style={[styles.field, isConflict && styles.fieldConflict]}>
            <View style={styles.fieldHeader}>
              <Text style={styles.fieldLabel}>{fieldLabel(entity, key)}</Text>
              {isConflict ? <Text style={styles.conflictTag}>تغيّر بعد الطلب</Text> : null}
            </View>
            {changed ? (
              <>
                <Text style={styles.before}>قبل: {formatValue(before)}</Text>
                <Text style={styles.after}>بعد: {formatValue(after)}</Text>
              </>
            ) : (
              <Text style={styles.unchanged}>{formatValue(after)}</Text>
            )}
          </View>
        );
      })}
    </View>
  );
}

function valuesEqual(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => v === b[i]);
  }
  return a === b;
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  empty: { fontSize: type.body.fontSize, fontFamily: "Cairo_500Medium", color: colors.onSurfaceVariant, textAlign: "center", padding: 16 },
  field: { backgroundColor: colors.surfaceContainer, borderRadius: 12, padding: 12, gap: 4 },
  fieldConflict: { borderWidth: 1, borderColor: colors.error },
  fieldHeader: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" },
  fieldLabel: { fontSize: type.label.fontSize, fontFamily: "Cairo_700Bold", color: colors.onSurface, textAlign: textStart },
  conflictTag: { fontSize: type.caption.fontSize, fontFamily: "Cairo_700Bold", color: colors.error },
  before: { fontSize: type.caption.fontSize, fontFamily: "Cairo_400Regular", color: colors.error, textAlign: textStart, textDecorationLine: "line-through" },
  after: { fontSize: type.body.fontSize, fontFamily: "Cairo_600SemiBold", color: colors.onSurface, textAlign: textStart },
  unchanged: { fontSize: type.body.fontSize, fontFamily: "Cairo_400Regular", color: colors.onSurfaceVariant, textAlign: textStart },
});
