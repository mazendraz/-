import { ActivityIndicator, Pressable, StyleSheet, Text, type ViewStyle } from "react-native";
import { colors, type } from "@alassema/core";

/**
 * The one button component every screen reaches for. `disabled` covers both
 * "the action doesn't apply right now" and "it's running" — `busy` only
 * changes what renders inside (a spinner instead of the label), never the
 * disabled logic itself, so a caller can't forget to also disable it while
 * busy.
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
  variant?: "primary" | "secondary" | "danger";
  busy?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}) {
  const inactive = busy || disabled;

  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy }}
      style={({ pressed }) => [
        styles.base,
        variantStyle(variant),
        inactive && styles.inactive,
        pressed && !inactive && styles.pressed,
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={variant === "primary" || variant === "danger" ? colors.onPrimary : colors.primary} />
      ) : (
        <Text style={[styles.label, labelStyle(variant)]}>{label}</Text>
      )}
    </Pressable>
  );
}

function variantStyle(variant: "primary" | "secondary" | "danger"): ViewStyle {
  if (variant === "primary") return { backgroundColor: colors.primary };
  if (variant === "danger") return { backgroundColor: colors.error };
  return {
    backgroundColor: colors.surfaceContainer,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
  };
}

function labelStyle(variant: "primary" | "secondary" | "danger") {
  if (variant === "primary" || variant === "danger") return { color: colors.onPrimary };
  return { color: colors.onSurface };
}

const styles = StyleSheet.create({
  base: {
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48, // touch target floor — matches the web's 44px+ rule with room
  },
  inactive: { opacity: 0.6 },
  pressed: { opacity: 0.85 },
  label: { fontSize: type.body.fontSize, fontFamily: "Cairo_700Bold" },
});
