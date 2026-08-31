import { StyleSheet, Text, TextInput, View } from "react-native";
import { colors, type } from "@alassema/core";
import { textStart } from "@alassema/mobile-shared";

/** Whole-pound amount input — no decimal keypad, no piastres (matches the
 *  platform-wide EGP convention — see lib/money.ts). */
export default function MoneyField({
  label,
  value,
  onChangeValue,
  error,
}: {
  label: string;
  value: string;
  onChangeValue: (v: string) => void;
  error?: string;
}) {
  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.row, error ? styles.rowError : null]}>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={(v) => onChangeValue(v.replace(/[^0-9]/g, ""))}
          keyboardType="number-pad"
          placeholder="0"
          placeholderTextColor={colors.onSurfaceVariant}
        />
        <Text style={styles.suffix}>ج.م</Text>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: type.label.fontSize,
    fontFamily: "Cairo_600SemiBold",
    color: colors.onSurfaceVariant,
    marginBottom: 6,
    textAlign: textStart,
  },
  row: {
    flexDirection: "row-reverse",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: 10,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
  },
  rowError: { borderColor: colors.error },
  input: {
    flex: 1,
    paddingVertical: 12,
    fontSize: type.title.fontSize,
    fontFamily: "Alexandria_700Bold",
    color: colors.onSurface,
    textAlign: textStart,
    fontVariant: ["tabular-nums"],
  },
  suffix: {
    fontSize: type.body.fontSize,
    fontFamily: "Cairo_600SemiBold",
    color: colors.onSurfaceVariant,
  },
  error: {
    marginTop: 4,
    fontSize: type.caption.fontSize,
    fontFamily: "Cairo_500Medium",
    color: colors.error,
    textAlign: textStart,
  },
});
