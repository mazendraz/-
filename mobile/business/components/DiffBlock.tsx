import { StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { colors, type } from "@alassema/core";
import { assetUri, isVideoUrl, rowStart, textStart } from "@alassema/mobile-shared";
import Icon from "./Icon";
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

/** Mirrors the website's app/src/lib/changeRequests.ts — the fields whose
 *  value is an image reference (single) or a list of them (gallery). Rendered
 *  as thumbnails, not as the raw Supabase URL text they used to print. */
const IMAGE_FIELDS = new Set(["logo", "cover", "image"]);
const IMAGE_LIST_FIELDS = new Set(["gallery"]);

function fieldLabel(entity: ChangeEntity, key: string): string {
  return FIELD_LABELS[entity][key] ?? key;
}

function formatValue(value: unknown): string {
  if (value == null || value === "") return "—";
  if (Array.isArray(value)) return value.length > 0 ? value.map(String).join("، ") : "—";
  if (typeof value === "boolean") return value ? "نعم" : "لا";
  return String(value);
}

/** One media reference — a still through expo-image (uploads are WebP, so
 *  never react-native's Image), a video as a labelled placeholder since
 *  expo-image can't decode a container. `muted` dims the "before" side. */
function MediaThumb({ uri, size, muted }: { uri: string; size: number; muted?: boolean }) {
  const box = { width: size, height: size };
  if (isVideoUrl(uri)) {
    return (
      <View style={[styles.thumb, styles.videoThumb, box, muted && styles.mutedMedia]}>
        <Icon name="play_arrow" size={size * 0.4} color={colors.onPrimary} />
      </View>
    );
  }
  return (
    <Image
      source={{ uri: assetUri(uri) }}
      style={[styles.thumb, box, muted && styles.mutedMedia]}
      contentFit="cover"
      transition={120}
    />
  );
}

/** The value cell for an image field — a single thumb, a wrapped strip for a
 *  gallery list, or a dash when empty. */
function MediaValue({ value, list, muted }: { value: unknown; list: boolean; muted?: boolean }) {
  if (list) {
    const items = Array.isArray(value) ? (value as unknown[]).filter((v): v is string => typeof v === "string" && v.length > 0) : [];
    if (items.length === 0) return <Text style={styles.unchanged}>—</Text>;
    return (
      <View style={styles.strip}>
        {items.slice(0, 12).map((uri, i) => (
          <MediaThumb key={`${uri}-${i}`} uri={uri} size={52} muted={muted} />
        ))}
      </View>
    );
  }
  if (typeof value !== "string" || !value) return <Text style={styles.unchanged}>—</Text>;
  return <MediaThumb uri={value} size={96} muted={muted} />;
}

/**
 * Before/after per field, the one component that makes a change request
 * actually reviewable — see phase-9's own note that this earns its keep.
 * `changes` is the requested new values; `snapshot` is what the field held
 * at submission time. A PUBLISH request's `changes` is often empty (nothing
 * is being edited, just made public), so a field present only in `snapshot`
 * still renders — as "no change, shown for context" (same value both sides).
 *
 * Image fields (logo/cover/image/gallery) render as thumbnails rather than
 * the raw storage URL — same treatment as the website's admin review tab.
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
  const hasGallery = keys.some((k) => IMAGE_LIST_FIELDS.has(k));

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
        const isImage = IMAGE_FIELDS.has(key);
        const isImageList = IMAGE_LIST_FIELDS.has(key);
        const isMedia = isImage || isImageList;

        return (
          <View key={key} style={[styles.field, isConflict && styles.fieldConflict]}>
            <View style={styles.fieldHeader}>
              <Text style={styles.fieldLabel}>{fieldLabel(entity, key)}</Text>
              {isConflict ? <Text style={styles.conflictTag}>تغيّر بعد الطلب</Text> : null}
            </View>
            {changed ? (
              isMedia ? (
                <>
                  <Text style={styles.beforeLabel}>قبل</Text>
                  <MediaValue value={before} list={isImageList} muted />
                  <Text style={styles.afterLabel}>بعد</Text>
                  <MediaValue value={after} list={isImageList} />
                </>
              ) : (
                <>
                  <Text style={styles.before}>قبل: {formatValue(before)}</Text>
                  <Text style={styles.after}>بعد: {formatValue(after)}</Text>
                </>
              )
            ) : isMedia ? (
              <MediaValue value={after} list={isImageList} />
            ) : (
              <Text style={styles.unchanged}>{formatValue(after)}</Text>
            )}
          </View>
        );
      })}
      {hasGallery ? (
        <Text style={styles.galleryNote}>معرض الصور بيتطبق كوحدة واحدة — الموافقة بتاخد الترتيب ده كله.</Text>
      ) : null}
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
  fieldHeader: { flexDirection: rowStart, justifyContent: "space-between", alignItems: "center" },
  fieldLabel: { fontSize: type.label.fontSize, fontFamily: "Cairo_700Bold", color: colors.onSurface, textAlign: textStart },
  conflictTag: { fontSize: type.caption.fontSize, fontFamily: "Cairo_700Bold", color: colors.error },
  before: { fontSize: type.caption.fontSize, fontFamily: "Cairo_400Regular", color: colors.error, textAlign: textStart, textDecorationLine: "line-through" },
  after: { fontSize: type.body.fontSize, fontFamily: "Cairo_600SemiBold", color: colors.onSurface, textAlign: textStart },
  beforeLabel: { fontSize: type.caption.fontSize, fontFamily: "Cairo_700Bold", color: colors.error, textAlign: textStart },
  afterLabel: { fontSize: type.caption.fontSize, fontFamily: "Cairo_700Bold", color: colors.onSurfaceVariant, textAlign: textStart, marginTop: 4 },
  unchanged: { fontSize: type.body.fontSize, fontFamily: "Cairo_400Regular", color: colors.onSurfaceVariant, textAlign: textStart },
  thumb: { borderRadius: 8, backgroundColor: colors.surfaceContainerLowest, borderWidth: 1, borderColor: colors.outlineVariant },
  videoThumb: { alignItems: "center", justifyContent: "center", backgroundColor: colors.primary, borderColor: colors.primary },
  mutedMedia: { opacity: 0.5 },
  strip: { flexDirection: rowStart, flexWrap: "wrap", gap: 6 },
  galleryNote: { fontSize: type.caption.fontSize, fontFamily: "Cairo_400Regular", color: colors.onSurfaceVariant, textAlign: textStart, backgroundColor: colors.surfaceContainer, borderRadius: 10, padding: 10 },
});
