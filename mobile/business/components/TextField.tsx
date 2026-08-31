import { StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";
import { colors, type } from "@alassema/core";
import { textStart } from "@alassema/mobile-shared";

export default function TextField({
  label,
  error,
  style,
  ...inputProps
}: TextInputProps & { label: string; error?: string }) {
  return (
    <View style={style}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, error ? styles.inputError : null]}
        placeholderTextColor={colors.onSurfaceVariant}
        {...inputProps}
      />
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
  input: {
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: type.body.fontSize,
    fontFamily: "Cairo_400Regular",
    color: colors.onSurface,
    textAlign: textStart,
    backgroundColor: colors.surface,
  },
  inputError: { borderColor: colors.error },
  error: {
    marginTop: 4,
    fontSize: type.caption.fontSize,
    fontFamily: "Cairo_500Medium",
    color: colors.error,
    textAlign: textStart,
  },
});
