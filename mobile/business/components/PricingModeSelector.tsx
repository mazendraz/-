import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, type } from "@alassema/core";
import { textStart } from "@alassema/mobile-shared";

type PricingMode = "QUOTE_ONLY" | "FIXED_CATALOG";

/**
 * Switching this changes the public REQUEST FLOW for every company in the
 * category (whether they may run a priced catalog at all — see
 * ApiCategoryPricingMode's own comment) — not a cosmetic label. The confirm
 * copy names the actual consequence, using `affectedCompanies` (the
 * category's own `publishedOfferingCompanyCount` when switching AWAY from
 * FIXED_CATALOG — how many companies would lose their live catalog).
 */
export default function PricingModeSelector({
  value,
  onChange,
  affectedCompanies,
}: {
  value: PricingMode;
  onChange: (next: PricingMode) => void;
  /** Companies with a published catalog that would be affected by switching
   *  to QUOTE_ONLY. Only meaningful when `value` is currently FIXED_CATALOG. */
  affectedCompanies: number;
}) {
  return (
    <View style={styles.wrap}>
      <Pressable
        style={[styles.option, value === "QUOTE_ONLY" && styles.optionActive]}
        onPress={() => onChange("QUOTE_ONLY")}
      >
        <Text style={[styles.optionTitle, value === "QUOTE_ONLY" && styles.optionTitleActive]}>طلب عرض سعر</Text>
        <Text style={[styles.optionDesc, value === "QUOTE_ONLY" && styles.optionDescActive]}>
          العميل يبعت طلب والشركة ترد بسعر — من غير قائمة أسعار ثابتة.
        </Text>
      </Pressable>
      <Pressable
        style={[styles.option, value === "FIXED_CATALOG" && styles.optionActive]}
        onPress={() => onChange("FIXED_CATALOG")}
      >
        <Text style={[styles.optionTitle, value === "FIXED_CATALOG" && styles.optionTitleActive]}>قائمة أسعار</Text>
        <Text style={[styles.optionDesc, value === "FIXED_CATALOG" && styles.optionDescActive]}>
          الشركات في التصنيف ده تقدر تنشر قائمة أسعار، والعميل يطلب ويدفع على السعر المعروض مباشرة.
        </Text>
      </Pressable>

      {value === "FIXED_CATALOG" && affectedCompanies > 0 ? (
        <View style={styles.warnCard}>
          <Text style={styles.warnText}>
            {affectedCompanies} شركة عندها قائمة أسعار منشورة في التصنيف ده دلوقتي — لو رجّعته "طلب عرض سعر" هتختفي قائمة الأسعار من عندهم.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  option: { borderWidth: 1, borderColor: colors.outlineVariant, borderRadius: 12, padding: 14, gap: 4, backgroundColor: colors.surface },
  optionActive: { backgroundColor: colors.primaryContainer, borderColor: colors.primary },
  optionTitle: { fontSize: type.body.fontSize, fontFamily: "Cairo_700Bold", color: colors.onSurface, textAlign: textStart },
  optionTitleActive: { color: colors.onPrimaryContainer },
  optionDesc: { fontSize: type.caption.fontSize, fontFamily: "Cairo_400Regular", color: colors.onSurfaceVariant, textAlign: textStart, lineHeight: 18 },
  optionDescActive: { color: colors.onPrimaryContainer },
  warnCard: { backgroundColor: colors.errorContainer, borderRadius: 12, padding: 12 },
  warnText: { fontSize: type.caption.fontSize, fontFamily: "Cairo_600SemiBold", color: colors.onErrorContainer, textAlign: textStart, lineHeight: 18 },
});
