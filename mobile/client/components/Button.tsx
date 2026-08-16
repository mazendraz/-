import { ActivityIndicator, Pressable, StyleSheet, Text, type ViewStyle } from "react-native";
import { colors, type } from "@alassema/core";

/**
 * The one button component every screen reaches for.
 *
 * `disabled` covers both "the action doesn't apply right now" and "it's
 * running" — the `busy` prop only changes what's rendered inside (a spinner
 * instead of the label), never the disabled logic itself, so a caller can't
 * forget to also disable it while busy.
 */
export default function Button({
  label,
  onPress,
  variant = "primary",
  busy = false,
  disabled = false,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary";
  busy?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}) {
  const isPrimary = variant === "primary";
  const inactive = busy || disabled;

  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy }}
      style={({ pressed }) => [
        styles.base,
        isPrimary ? styles.primary : styles.secondary,
        inactive && styles.inactive,
        pressed && !inactive && styles.pressed,
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={isPrimary ? colors.onPrimary : colors.primary} />
      ) : (
        <Text style={[styles.label, isPrimary ? styles.labelPrimary : styles.labelSecondary]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48, // touch target floor — matches the web's 44px+ rule with room
  },
  primary: { backgroundColor: colors.primary },
  secondary: {
    backgroundColor: colors.surfaceContainer,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
  },
  inactive: { opacity: 0.6 },
  pressed: { opacity: 0.85 },
  label: { fontSize: type.body.fontSize, fontFamily: "Cairo_700Bold" },
  labelPrimary: { color: colors.onPrimary },
  labelSecondary: { color: colors.onSurface },
});
