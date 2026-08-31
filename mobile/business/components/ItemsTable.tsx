import { StyleSheet, Text, View } from "react-native";
import type { ApiLeadItem } from "@alassema/core";
import { colors, type } from "@alassema/core";
import { textStart } from "@alassema/mobile-shared";
import { formatEgp } from "../lib/money";

/**
 * A lead's multi-item request lines (Feature C). Every price here is a
 * SNAPSHOT from submission time — never re-derived from the current
 * catalog, because a later price change must not rewrite what this customer
 * was quoted. Renders exactly what's on the lead, nothing looked up.
 */
export default function ItemsTable({ items }: { items: ApiLeadItem[] }) {
  if (items.length === 0) return null;

  return (
    <View style={styles.table}>
      {items.map((item) => (
        <View key={item.id} style={styles.row}>
          <View style={styles.nameCol}>
            <Text style={styles.name} numberOfLines={2}>
              {item.nameSnapshot}
              {item.tierLabel ? ` — ${item.tierLabel}` : ""}
            </Text>
            <Text style={styles.qty}>× {item.qty}</Text>
          </View>
          <Text style={styles.price}>{lineText(item)}</Text>
        </View>
      ))}
    </View>
  );
}

function lineText(item: ApiLeadItem): string {
  if (item.pricingModel === "ON_INSPECTION" || item.lineMin == null) {
    return "بعد المعاينة";
  }
  if (item.lineMax != null && item.lineMax !== item.lineMin) {
    return `${formatEgp(item.lineMin)}–${formatEgp(item.lineMax)}`;
  }
  return formatEgp(item.lineMin);
}

const styles = StyleSheet.create({
  table: {
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: 12,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.outlineVariant,
  },
  nameCol: { flex: 1, gap: 2 },
  name: {
    fontSize: type.body.fontSize,
    fontFamily: "Cairo_500Medium",
    color: colors.onSurface,
    textAlign: textStart,
  },
  qty: {
    fontSize: type.caption.fontSize,
    fontFamily: "Cairo_400Regular",
    color: colors.onSurfaceVariant,
    textAlign: textStart,
  },
  price: {
    fontSize: type.label.fontSize,
    fontFamily: "Cairo_600SemiBold",
    color: colors.onSurface,
    fontVariant: ["tabular-nums"],
  },
});
