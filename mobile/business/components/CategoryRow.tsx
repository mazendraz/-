import { Pressable, StyleSheet, Text, View } from "react-native";
import type { ApiAdminCategory } from "@alassema/core";
import { colors, type } from "@alassema/core";
import { textStart } from "@alassema/mobile-shared";

export default function CategoryRow({ category, onPress }: { category: ApiAdminCategory; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <View style={styles.info}>
        <Text style={styles.label} numberOfLines={1}>{category.label}</Text>
        <Text style={styles.meta}>
          {category.count} شركة · {category.pricingMode === "FIXED_CATALOG" ? "قائمة أسعار" : "طلب عرض سعر"}
          {!category.isActive ? " · مخفية" : ""}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.outlineVariant, borderRadius: 14, padding: 14 },
  pressed: { opacity: 0.7 },
  info: { gap: 3 },
  label: { fontSize: type.body.fontSize, fontFamily: "Cairo_700Bold", color: colors.onSurface, textAlign: textStart },
  meta: { fontSize: type.caption.fontSize, fontFamily: "Cairo_400Regular", color: colors.onSurfaceVariant, textAlign: textStart },
});
