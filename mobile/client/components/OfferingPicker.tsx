import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { ApiBundleRule, ApiOffering } from "@alassema/core";
import { colors, type } from "@alassema/core";
import Icon from "./Icon";
import { calculateRequest, formatEstimate, formatPrice, formatQtyRange, isQuoteOnly } from "../lib/pricing";

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
 *
 * Redesigned as selectable marketplace cards (2026-08-22): same props,
 * same selection/qty/tier logic — only the presentation changed. The
 * price sits on its own line under the name rather than sharing a row with
 * it (the two were competing for attention), and the selected state reads
 * from a soft primary tint + border rather than a filled checkbox.
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
        const quote = isQuoteOnly(offering);
        const hasOptions = isSelected && item && (offering.kind === "PRODUCT" || offering.tiers.length > 0);

        return (
          <Pressable
            key={offering.id}
            style={[styles.card, isSelected && styles.cardSelected]}
            onPress={() => toggle(offering)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: isSelected }}
            accessibilityLabel={offering.name}
          >
            <View style={styles.topRow}>
              <Text style={styles.name}>{offering.name}</Text>
              <View style={[styles.dot, isSelected && styles.dotSelected]}>
                {isSelected && <Icon name="check" size={12} color={colors.onPrimary} />}
              </View>
            </View>

            {offering.description ? (
              <Text style={styles.desc} numberOfLines={2}>{offering.description}</Text>
            ) : null}

            <Text style={[styles.price, quote ? styles.priceQuote : styles.priceFixed]}>
              {formatPrice(offering)}
            </Text>

            {hasOptions && item && (
              <View style={styles.optionsRow}>
                {offering.kind === "PRODUCT" && (
                  <View style={styles.stepper}>
                    <Pressable
                      style={styles.stepperBtn}
                      onPress={() => patch(offering.id, { qty: Math.max(1, item.qty - 1) })}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel="إنقاص الكمية"
                    >
                      <Text style={styles.stepperGlyph}>−</Text>
                    </Pressable>
                    <View style={styles.stepperDivider} />
                    <Text style={styles.stepperValue}>{item.qty}</Text>
                    <View style={styles.stepperDivider} />
                    <Pressable
                      style={styles.stepperBtn}
                      onPress={() => patch(offering.id, { qty: item.qty + 1 })}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel="زيادة الكمية"
                    >
                      <Text style={styles.stepperGlyph}>+</Text>
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
          <Text style={styles.summaryTitle}>ملخص الطلب</Text>

          <View style={styles.summaryCountRow}>
            <Text style={styles.summaryCountLabel}>الخدمات المختارة</Text>
            <View style={styles.summaryCountBadge}>
              <Text style={styles.summaryCountValue}>{value.length}</Text>
            </View>
          </View>

          <View style={styles.summaryDivider} />

          <Text style={styles.summaryTotalLabel}>الإجمالي التقديري</Text>
          <Text style={styles.summaryTotalValue}>{formatEstimate(result)}</Text>

          {result.discountPercent > 0 && (
            <Text style={styles.summaryDiscount}>خصم الباقة {result.discountPercent}٪ (على البنود المسعّرة)</Text>
          )}
          {result.hasOnInspection && <Text style={styles.summaryNote}>+ بنود تتحدد بعد المعاينة</Text>}
          <Text style={styles.summaryFooter}>السعر النهائي يتأكد مع الشركة</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 10 },

  card: {
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    padding: 14,
    gap: 4,
  },
  cardSelected: {
    borderColor: colors.primary,
    borderWidth: 1.5,
    backgroundColor: `${colors.primary}12`,
  },
  topRow: { flexDirection: "row-reverse", alignItems: "flex-start", justifyContent: "space-between", gap: 10 },
  name: { flex: 1, fontFamily: "Cairo_700Bold", fontSize: type.body.fontSize, color: colors.onSurface, textAlign: "right" },
  dot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.outlineVariant,
    backgroundColor: colors.surfaceContainerLowest,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  dotSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  desc: { fontFamily: "Cairo_400Regular", fontSize: type.caption.fontSize, color: colors.outline, textAlign: "right", lineHeight: 18 },
  price: { fontFamily: "Cairo_600SemiBold", fontSize: type.label.fontSize, textAlign: "right", marginTop: 2 },
  priceFixed: { color: colors.primary, fontFamily: "Alexandria_700Bold" },
  priceQuote: { color: colors.outline },

  optionsRow: { marginTop: 10, paddingTop: 10, gap: 10, alignItems: "flex-end" },

  // A single pill housing all three segments (rather than three separate
  // floating circles) — compact, touch-friendly, and reads as one control.
  stepper: {
    flexDirection: "row-reverse",
    alignItems: "center",
    backgroundColor: colors.surfaceContainer,
    borderRadius: 999,
    height: 36,
    paddingHorizontal: 4,
  },
  stepperBtn: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  stepperGlyph: { fontFamily: "Cairo_700Bold", fontSize: 18, color: colors.primary, lineHeight: 20 },
  stepperDivider: { width: 1, height: 16, backgroundColor: colors.outlineVariant, marginHorizontal: 2 },
  stepperValue: { fontFamily: "Cairo_700Bold", fontSize: type.body.fontSize, color: colors.onSurface, minWidth: 28, textAlign: "center" },

  tierRow: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 6, justifyContent: "flex-end" },
  tierChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: colors.surfaceContainer },
  tierChipActive: { backgroundColor: colors.primary },
  tierChipText: { fontFamily: "Cairo_600SemiBold", fontSize: type.caption.fontSize, color: colors.onSurfaceVariant },
  tierChipTextActive: { color: colors.onPrimary },

  summary: {
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    padding: 16,
    gap: 4,
    marginTop: 2,
  },
  summaryTitle: { fontFamily: "Cairo_700Bold", fontSize: type.label.fontSize, color: colors.onSurface, textAlign: "right", marginBottom: 4 },
  summaryCountRow: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" },
  summaryCountLabel: { fontFamily: "Cairo_400Regular", fontSize: type.caption.fontSize, color: colors.onSurfaceVariant },
  summaryCountBadge: { backgroundColor: colors.surfaceContainer, borderRadius: 999, minWidth: 24, height: 24, alignItems: "center", justifyContent: "center", paddingHorizontal: 8 },
  summaryCountValue: { fontFamily: "Cairo_700Bold", fontSize: type.caption.fontSize, color: colors.onSurface },
  summaryDivider: { height: 1, backgroundColor: colors.outlineVariant, marginVertical: 10 },
  summaryTotalLabel: { fontFamily: "Cairo_600SemiBold", fontSize: type.caption.fontSize, color: colors.onSurfaceVariant, textAlign: "right" },
  summaryTotalValue: { fontFamily: "Alexandria_800ExtraBold", fontSize: type.headline.fontSize, color: colors.primary, textAlign: "right", marginTop: 2 },
  summaryDiscount: { fontFamily: "Cairo_700Bold", fontSize: type.caption.fontSize, color: colors.primary, textAlign: "right", marginTop: 8 },
  summaryNote: { fontFamily: "Cairo_600SemiBold", fontSize: type.caption.fontSize, color: colors.onSurfaceVariant, textAlign: "right", marginTop: 4 },
  summaryFooter: { fontFamily: "Cairo_400Regular", fontSize: type.caption.fontSize, color: colors.outline, textAlign: "right", marginTop: 4 },
});
