import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, type } from "@alassema/core";
import { textStart } from "@alassema/mobile-shared";
import WaitingFor from "./WaitingFor";

/**
 * One generic row shared by all five queues — each screen maps its own item
 * shape into these props rather than this component knowing about
 * ChangeRequest/Project/Review/SiteReview/Feedback individually. Matches
 * the "normalised row shape" phase-9's own task 9.1 asks for.
 */
export default function ApprovalRow({
  title,
  subtitle,
  createdAt,
  onPress,
}: {
  title: string;
  subtitle: string;
  createdAt: number;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
        <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>
      </View>
      <WaitingFor createdAt={createdAt} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: 14,
    padding: 14,
  },
  pressed: { opacity: 0.7 },
  info: { flex: 1, gap: 3 },
  title: { fontSize: type.body.fontSize, fontFamily: "Cairo_700Bold", color: colors.onSurface, textAlign: textStart },
  subtitle: { fontSize: type.label.fontSize, fontFamily: "Cairo_400Regular", color: colors.onSurfaceVariant, textAlign: textStart },
});
