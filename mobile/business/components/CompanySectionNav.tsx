import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, type } from "@alassema/core";
import { textStart } from "@alassema/mobile-shared";

export default function CompanySectionNav({
  sections,
}: {
  sections: { label: string; onPress: () => void }[];
}) {
  return (
    <View style={styles.wrap}>
      {sections.map((s) => (
        <Pressable key={s.label} style={styles.row} onPress={s.onPress}>
          <Text style={styles.label}>{s.label}</Text>
          <Text style={styles.chevron}>‹</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: 14, borderWidth: 1, borderColor: colors.outlineVariant, overflow: "hidden" },
  row: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: colors.outlineVariant,
    backgroundColor: colors.surface,
  },
  label: { fontSize: type.body.fontSize, fontFamily: "Cairo_600SemiBold", color: colors.onSurface, textAlign: textStart },
  chevron: { fontSize: type.title.fontSize, color: colors.outline },
});
