import { Pressable, StyleSheet, Text, View } from "react-native";
import type { ApiAdminUser } from "@alassema/core";
import { colors, type } from "@alassema/core";
import { textStart } from "@alassema/mobile-shared";

export default function UserRow({ user, onPress }: { user: ApiAdminUser; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed, !user.isActive && styles.rowInactive]}>
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>{user.name}</Text>
        <Text style={styles.email} numberOfLines={1}>{user.email}</Text>
        {user.companyName ? <Text style={styles.company} numberOfLines={1}>{user.companyName}</Text> : null}
      </View>
      <View style={styles.chips}>
        <View style={[styles.chip, user.role === "ADMIN" ? styles.chipAdmin : styles.chipProvider]}>
          <Text style={styles.chipText}>{user.role === "ADMIN" ? "أدمن" : "مقدّم خدمة"}</Text>
        </View>
        {!user.isActive ? (
          <View style={[styles.chip, styles.chipInactive]}>
            <Text style={styles.chipText}>معطّل</Text>
          </View>
        ) : null}
      </View>
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
  rowInactive: { opacity: 0.6 },
  pressed: { opacity: 0.7 },
  info: { flex: 1, gap: 2 },
  name: { fontSize: type.body.fontSize, fontFamily: "Cairo_700Bold", color: colors.onSurface, textAlign: textStart },
  email: { fontSize: type.caption.fontSize, fontFamily: "Cairo_400Regular", color: colors.onSurfaceVariant, textAlign: textStart },
  company: { fontSize: type.caption.fontSize, fontFamily: "Cairo_500Medium", color: colors.primary, textAlign: textStart },
  chips: { flexDirection: "column", gap: 4, alignItems: "flex-end" },
  chip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  chipAdmin: { backgroundColor: colors.primaryContainer },
  chipProvider: { backgroundColor: colors.secondaryContainer },
  chipInactive: { backgroundColor: colors.errorContainer },
  chipText: { fontSize: type.caption.fontSize, fontFamily: "Cairo_700Bold", color: colors.onSurface },
});
