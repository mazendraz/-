import { Pressable, StyleSheet, Text, View } from "react-native";
import type { ApiOfferingKind } from "@alassema/core";
import { colors, type } from "@alassema/core";
import { rowStart, textStart } from "@alassema/mobile-shared";

/**
 * خدمة / منتج — the catalog-item kind. `Offering.kind` has existed in the
 * schema, in `ApiOffering` and in the provider/admin upsert validation all
 * along, and the website's offering editor has always offered the choice
 * (OfferingsEditor's `kind` <Select>). This editor only ever created
 * SERVICEs, so a provider selling a physical product had no way to say so.
 *
 * Two options, so a segmented pair of chips rather than a dropdown — same
 * visual language as PriceFields' pricing-model row right below it.
 */
const OPTIONS: { value: ApiOfferingKind; label: string }[] = [
  { value: "SERVICE", label: "خدمة" },
  { value: "PRODUCT", label: "منتج" },
];

export default function KindSelector({
  value,
  onChange,
}: {
  value: ApiOfferingKind;
  onChange: (kind: ApiOfferingKind) => void;
}) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>النوع</Text>
      <View style={styles.row}>
        {OPTIONS.map((o) => (
          <Pressable
            key={o.value}
            style={[styles.chip, value === o.value && styles.chipActive]}
            onPress={() => onChange(o.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: value === o.value }}
          >
            <Text style={[styles.chipLabel, value === o.value && styles.chipLabelActive]}>{o.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  label: { fontSize: type.label.fontSize, fontFamily: "Cairo_600SemiBold", color: colors.onSurfaceVariant, textAlign: textStart },
  row: { flexDirection: rowStart, gap: 8 },
  chip: { flex: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: colors.surfaceContainer, alignItems: "center" },
  chipActive: { backgroundColor: colors.primary },
  chipLabel: { fontSize: type.caption.fontSize, fontFamily: "Cairo_600SemiBold", color: colors.onSurfaceVariant },
  chipLabelActive: { color: colors.onPrimary },
});
