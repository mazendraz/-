import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { ApiBundleRule, ApiOffering } from "@alassema/core";
import { colors, type } from "@alassema/core";
import Icon from "./Icon";
import { calculateRequest, formatEstimate, formatPrice, formatQtyRange } from "../lib/pricing";

export interface CartItem {
  offeringId: string;
  qty: number;
  tierId: string | null;
}

/**
 * Multi-item offering selection — the mobile counterpart of the website's
 * RequestItemPicker.tsx (checkbox + quantity + tier per offering, live
 * estimate underneath). Tier choice is a horizontal chip row here instead of
 * a `<Select>` — there's no native select primitive to reach for, and a
 * company's catalog realistically has a handful of tiers, not enough to need
 * one.
 */
export default function OfferingPicker({
  offerings,
  bundleRules,
  value,
  onChange,
}: {
  offerings: ApiOffering[];
  bundleRules: ApiBundleRule[];
  value: CartItem[];
  onChange: (items: CartItem[]) => void;
}) {
  const selected = useMemo(() => new Map(value.map((i) => [i.offeringId, i])), [value]);

  function toggle(offering: ApiOffering) {
    if (selected.has(offering.id)) {
      onChange(value.filter((i) => i.offeringId !== offering.id));
    } else {
      onChange([...value, { offeringId: offering.id, qty: offering.minQty ?? 1, tierId: null }]);
    }
  }

  function patch(offeringId: string, changes: Partial<CartItem>) {
    onChange(value.map((i) => (i.offeringId === offeringId ? { ...i, ...changes } : i)));
  }

  const result = useMemo(() => {
    const priced = value.flatMap((item) => {
      const offering = offerings.find((o) => o.id === item.offeringId);
      if (!offering) return [];
      const tier = item.tierId ? offering.tiers.find((t) => t.id === item.tierId) : undefined;
      return [{
        qty: item.qty,
        pricingModel: offering.pricingModel,
        unitPriceMin: tier ? tier.priceMin : offering.priceMin,
        unitPriceMax: tier ? tier.priceMax : offering.priceMax,
      }];
    });
    return calculateRequest(priced, bundleRules);
  }, [value, offerings, bundleRules]);

  if (offerings.length === 0) return null;

  return (
    <View style={styles.container}>
      {offerings.map((offering) => {
        const item = selected.get(offering.id);
        const isSelected = !!item;
        return (
          <Pressable
            key={offering.id}
            style={[styles.card, isSelected && styles.cardSelected]}
            onPress={() => toggle(offering)}
          >
            <View style={styles.row}>
              <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                {isSelected && <Icon name="check_circle" size={14} color={colors.onPrimary} />}
              </View>
              <View style={styles.rowText}>
                <View style={styles.rowHeader}>
                  <Text style={styles.name}>{offering.name}</Text>
                  <Text style={styles.price}>{formatPrice(offering)}</Text>
                </View>
                {offering.description ? (
                  <Text style={styles.desc} numberOfLines={2}>{offering.description}</Text>
                ) : null}
              </View>
            </View>

            {isSelected && item && (offering.kind === "PRODUCT" || offering.tiers.length > 0) && (
              <View style={styles.optionsRow}>
                {offering.kind === "PRODUCT" && (
                  <View style={styles.qtyStepper}>
                    <Pressable
                      style={styles.qtyBtn}
                      onPress={() => patch(offering.id, { qty: Math.max(1, item.qty - 1) })}
                      hitSlop={8}
                    >
                      <Text style={styles.qtyBtnText}>−</Text>
                    </Pressable>
                    <Text style={styles.qtyValue}>{item.qty}</Text>
                    <Pressable style={styles.qtyBtn} onPress={() => patch(offering.id, { qty: item.qty + 1 })} hitSlop={8}>
                      <Text style={styles.qtyBtnText}>+</Text>
                    </Pressable>
                  </View>
                )}

                {offering.tiers.length > 0 && (
                  <View style={styles.tierRow}>
                    <Pressable
                      style={[styles.tierChip, !item.tierId && styles.tierChipActive]}
                      onPress={() => patch(offering.id, { tierId: null })}
                    >
                      <Text style={[styles.tierChipText, !item.tierId && styles.tierChipTextActive]}>السعر العادي</Text>
                    </Pressable>
                    {offering.tiers.map((tier) => {
                      const range = formatQtyRange(tier);
                      return (
                        <Pressable
                          key={tier.id}
                          style={[styles.tierChip, item.tierId === tier.id && styles.tierChipActive]}
                          onPress={() => patch(offering.id, { tierId: tier.id })}
                        >
                          <Text style={[styles.tierChipText, item.tierId === tier.id && styles.tierChipTextActive]}>
                            {tier.label}{range ? ` (${range})` : ""}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                )}
              </View>
            )}
          </Pressable>
        );
      })}

      {value.length > 0 && (
        <View style={styles.summary}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>الإجمالي التقديري</Text>
            <Text style={styles.summaryValue}>{formatEstimate(result)}</Text>
          </View>
          {result.discountPercent > 0 && (
            <Text style={styles.summaryDiscount}>خصم الباقة {result.discountPercent}٪ (على البنود المسعّرة)</Text>
          )}
          {result.hasOnInspection && <Text style={styles.summaryNote}>+ بنود تتحدد بعد المعاينة</Text>}
          <Text style={styles.summaryNote}>السعر النهائي بيتأكد مع الشركة</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8 },
  card: { borderRadius: 16, padding: 12, borderWidth: 1, borderColor: colors.outlineVariant, backgroundColor: colors.surfaceContainerLowest },
  cardSelected: { borderColor: colors.primary, backgroundColor: `${colors.primary}0d` },
  row: { flexDirection: "row-reverse", alignItems: "flex-start", gap: 10 },
  checkbox: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.outlineVariant, alignItems: "center", justifyContent: "center", marginTop: 2 },
  checkboxSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  rowText: { flex: 1, gap: 2 },
  rowHeader: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", gap: 8 },
  name: { fontFamily: "Cairo_700Bold", fontSize: type.label.fontSize, color: colors.onSurface, textAlign: "right", flexShrink: 1 },
  price: { fontFamily: "Cairo_700Bold", fontSize: type.label.fontSize, color: colors.primary },
  desc: { fontFamily: "Cairo_400Regular", fontSize: type.caption.fontSize, color: colors.outline, textAlign: "right" },
  optionsRow: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.outlineVariant, gap: 8 },
  qtyStepper: { flexDirection: "row-reverse", alignItems: "center", gap: 10, alignSelf: "flex-end" },
  qtyBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.surfaceContainer, alignItems: "center", justifyContent: "center" },
  qtyBtnText: { fontFamily: "Cairo_700Bold", fontSize: type.body.fontSize, color: colors.primary },
  qtyValue: { fontFamily: "Cairo_700Bold", fontSize: type.body.fontSize, color: colors.onSurface, minWidth: 20, textAlign: "center" },
  tierRow: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 6 },
  tierChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: colors.surfaceContainer },
  tierChipActive: { backgroundColor: colors.primary },
  tierChipText: { fontFamily: "Cairo_600SemiBold", fontSize: type.caption.fontSize, color: colors.onSurfaceVariant },
  tierChipTextActive: { color: colors.onPrimary },
  summary: { borderRadius: 16, backgroundColor: colors.surfaceContainer, borderTopWidth: 3, borderTopColor: colors.primary, padding: 14, gap: 4 },
  summaryRow: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" },
  summaryLabel: { fontFamily: "Cairo_700Bold", fontSize: type.label.fontSize, color: colors.outline },
  summaryValue: { fontFamily: "Alexandria_800ExtraBold", fontSize: type.title.fontSize, color: colors.primary },
  summaryDiscount: { fontFamily: "Cairo_700Bold", fontSize: type.caption.fontSize, color: colors.primary, textAlign: "right" },
  summaryNote: { fontFamily: "Cairo_400Regular", fontSize: type.caption.fontSize, color: colors.outline, textAlign: "right" },
});
