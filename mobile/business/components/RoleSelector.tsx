import { Pressable, StyleSheet, Text, View } from "react-native";
import type { ApiUserRole } from "@alassema/core";
import { colors, type } from "@alassema/core";

export default function RoleSelector({ value, onChange }: { value: ApiUserRole; onChange: (role: ApiUserRole) => void }) {
  return (
    <View style={styles.row}>
      <Pressable style={[styles.option, value === "PROVIDER" && styles.optionActive]} onPress={() => onChange("PROVIDER")}>
        <Text style={[styles.label, value === "PROVIDER" && styles.labelActive]}>مقدّم خدمة</Text>
      </Pressable>
      <Pressable style={[styles.option, value === "ADMIN" && styles.optionActive]} onPress={() => onChange("ADMIN")}>
        <Text style={[styles.label, value === "ADMIN" && styles.labelActive]}>أدمن</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row-reverse", gap: 8 },
  option: { flex: 1, borderRadius: 10, paddingVertical: 12, alignItems: "center", backgroundColor: colors.surfaceContainer },
  optionActive: { backgroundColor: colors.primary },
  label: { fontSize: type.body.fontSize, fontFamily: "Cairo_700Bold", color: colors.onSurfaceVariant },
  labelActive: { color: colors.onPrimary },
});
