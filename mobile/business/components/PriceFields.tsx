import { Pressable, StyleSheet, Text, View } from "react-native";
import type { ApiPriceUnit, ApiPricingModel } from "@alassema/core";
import { colors, type } from "@alassema/core";
import { textStart } from "@alassema/mobile-shared";
import MoneyField from "./MoneyField";
import { unitLabel } from "../lib/money";

const MODELS: { value: ApiPricingModel; label: string }[] = [
  { value: "FIXED", label: "سعر ثابت" },
  { value: "RANGE", label: "من – لـ" },
  { value: "PER_UNIT", label: "سعر بالوحدة" },
  { value: "ON_INSPECTION", label: "بعد المعاينة" },
];

const UNITS: ApiPriceUnit[] = ["SQM", "METER", "PIECE", "DOOR", "WINDOW", "ROOM", "APARTMENT", "HOUR", "DAY", "JOB"];

/**
 * The model-dependent price form — the one piece of this screen most likely
 * to go wrong (see docs/architecture/business-app/phase-7-provider-catalog.md's
 * own risk note). Mirrors api's validation/offerings.ts refinePricing exactly:
 *   FIXED          → priceMin only, no priceMax
 *   RANGE          → both, min <= max
 *   PER_UNIT       → priceMin + a unit, priceMax optional (must be >= min)
 *   ON_INSPECTION  → NO price fields at all — showing one here would let a
 *                    provider type a number the server will reject outright.
 */
export default function PriceFields({
  pricingModel,
  onPricingModelChange,
  priceMin,
  priceMax,
  unit,
  onPriceMinChange,
  onPriceMaxChange,
  onUnitChange,
}: {
  pricingModel: ApiPricingModel;
  onPricingModelChange: (m: ApiPricingModel) => void;
  priceMin: string;
  priceMax: string;
  unit: ApiPriceUnit | null;
  onPriceMinChange: (v: string) => void;
  onPriceMaxChange: (v: string) => void;
  onUnitChange: (u: ApiPriceUnit) => void;
}) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>طريقة التسعير</Text>
      <View style={styles.modelRow}>
        {MODELS.map((m) => (
          <Pressable
            key={m.value}
            style={[styles.modelChip, pricingModel === m.value && styles.modelChipActive]}
            onPress={() => onPricingModelChange(m.value)}
          >
            <Text style={[styles.modelLabel, pricingModel === m.value && styles.modelLabelActive]}>{m.label}</Text>
          </Pressable>
        ))}
      </View>

      {pricingModel === "ON_INSPECTION" ? (
        <Text style={styles.inspectionNote}>السعر هيتحدد بعد ما تعاين الشغل — من غير رقم دلوقتي.</Text>
      ) : (
        <>
          <MoneyField
            label={pricingModel === "RANGE" ? "من" : "السعر"}
            value={priceMin}
            onChangeValue={onPriceMinChange}
          />
          {pricingModel === "RANGE" || pricingModel === "PER_UNIT" ? (
            <MoneyField
              label={pricingModel === "RANGE" ? "لـ" : "لحد (اختياري)"}
              value={priceMax}
              onChangeValue={onPriceMaxChange}
            />
          ) : null}
          {pricingModel === "PER_UNIT" ? (
            <View>
              <Text style={styles.label}>الوحدة</Text>
              <View style={styles.modelRow}>
                {UNITS.map((u) => (
                  <Pressable
                    key={u}
                    style={[styles.modelChip, unit === u && styles.modelChipActive]}
                    onPress={() => onUnitChange(u)}
                  >
                    <Text style={[styles.modelLabel, unit === u && styles.modelLabelActive]}>{unitLabel(u)}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  label: {
    fontSize: type.label.fontSize,
    fontFamily: "Cairo_600SemiBold",
    color: colors.onSurfaceVariant,
    textAlign: textStart,
  },
  modelRow: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8 },
  modelChip: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: colors.surfaceContainer },
  modelChipActive: { backgroundColor: colors.primary },
  modelLabel: { fontSize: type.caption.fontSize, fontFamily: "Cairo_600SemiBold", color: colors.onSurfaceVariant },
  modelLabelActive: { color: colors.onPrimary },
  inspectionNote: {
    fontSize: type.caption.fontSize,
    fontFamily: "Cairo_400Regular",
    color: colors.onSurfaceVariant,
    textAlign: textStart,
  },
});
