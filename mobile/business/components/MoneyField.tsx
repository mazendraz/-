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
  hint,
  editable = true,
}: {
  label: string;
  value: string;
  onChangeValue: (v: string) => void;
  error?: string;
  /** Explains where the number came from, or what to enter. */
  hint?: string;
  /** False renders the amount as a settled figure rather than an input — used
   *  where the catalogue already fixed the price and the provider is
   *  confirming it, not composing it. */
  editable?: boolean;
}) {
  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.row, !editable && styles.rowReadOnly, error ? styles.rowError : null]}>
        <TextInput
          style={[styles.input, !editable && styles.inputReadOnly]}
          value={value}
          onChangeText={(v) => onChangeValue(v.replace(/[^0-9]/g, ""))}
          keyboardType="number-pad"
          placeholder="0"
          placeholderTextColor={colors.onSurfaceVariant}
          editable={editable}
        />
        <Text style={styles.suffix}>ج.م</Text>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  rowReadOnly: { backgroundColor: colors.surfaceContainer, borderColor: colors.outlineVariant },
  inputReadOnly: { color: colors.onSurfaceVariant },
  hint: {
    fontSize: type.caption.fontSize,
    fontFamily: "Cairo_400Regular",
    color: colors.outline,
    marginTop: 6,
    textAlign: textStart,
  },
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
