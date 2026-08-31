import { Pressable, StyleSheet, Text, View } from "react-native";
import type { ApiOfferingTier } from "@alassema/core";
import { colors, type } from "@alassema/core";
import { textStart } from "@alassema/mobile-shared";
import { formatEgp } from "../lib/money";

function qtyRange(tier: ApiOfferingTier): string {
  if (tier.qtyMin != null && tier.qtyMax != null) return `${tier.qtyMin}–${tier.qtyMax}`;
  if (tier.qtyMin != null) return `${tier.qtyMin}+`;
  if (tier.qtyMax != null) return `حتى ${tier.qtyMax}`;
  return "";
}

function priceRange(tier: ApiOfferingTier): string {
  if (tier.priceMin == null) return "";
  if (tier.priceMax != null && tier.priceMax !== tier.priceMin) {
    return `${formatEgp(tier.priceMin)}–${formatEgp(tier.priceMax)}`;
  }
  return formatEgp(tier.priceMin);
}

export default function TierRow({ tier, onDelete }: { tier: ApiOfferingTier; onDelete: () => void }) {
  return (
    <View style={styles.row}>
      <View style={styles.info}>
        <Text style={styles.label}>{tier.label}</Text>
        <Text style={styles.meta}>
          {qtyRange(tier)}
          {qtyRange(tier) && priceRange(tier) ? " · " : ""}
          {priceRange(tier)}
          {!tier.isPublished ? " · مسودة" : ""}
        </Text>
      </View>
      <Pressable style={styles.deleteBtn} onPress={onDelete}>
        <Text style={styles.deleteLabel}>حذف</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: 10,
    padding: 10,
    gap: 8,
  },
  info: { flex: 1, gap: 2 },
  label: { fontSize: type.body.fontSize, fontFamily: "Cairo_600SemiBold", color: colors.onSurface, textAlign: textStart },
  meta: { fontSize: type.caption.fontSize, fontFamily: "Cairo_400Regular", color: colors.onSurfaceVariant, textAlign: textStart },
  deleteBtn: { backgroundColor: colors.errorContainer, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  deleteLabel: { fontFamily: "Cairo_700Bold", fontSize: 11, color: colors.onErrorContainer },
});
