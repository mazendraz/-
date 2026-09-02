import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type ViewStyle } from "react-native";
import { colors, type } from "@alassema/core";

/**
 * The one button component every screen reaches for.
 *
 * `disabled` covers both "the action doesn't apply right now" and "it's
 * running" — the `busy` prop only changes what's rendered inside (a spinner
 * instead of the label), never the disabled logic itself, so a caller can't
 * forget to also disable it while busy.
 *
 * `variant="google"` + `icon` exist for exactly one caller (sign-in's
 * "Continue with Google") — a real OAuth-style button (white, bordered, dark
 * text) rather than the app's own primary/secondary treatment, since an
 * unbranded blue pill next to Google's own icon would misrepresent whose
 * button it is.
 */
export default function Button({
  label,
  onPress,
  variant = "primary",
  icon,
  busy = false,
  disabled = false,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "google" | "danger";
  icon?: ReactNode;
  busy?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}) {
  const isPrimary = variant === "primary";
  const isGoogle = variant === "google";
  const isDanger = variant === "danger";
  const inactive = busy || disabled;

  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy }}
      style={({ pressed }) => [
        styles.base,
        isPrimary ? styles.primary : isGoogle ? styles.google : isDanger ? styles.danger : styles.secondary,
        inactive && styles.inactive,
        pressed && !inactive && styles.pressed,
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={isPrimary ? colors.onPrimary : isDanger ? colors.error : colors.primary} />
      ) : (
        <View style={styles.content}>
          {icon}
          <Text
            style={[
              styles.label,
              isPrimary
                ? styles.labelPrimary
                : isGoogle
                  ? styles.labelGoogle
                  : isDanger
                    ? styles.labelDanger
                    : styles.labelSecondary,
            ]}
          >
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: 12,
    paddingVertical: 14,
    // Horizontal padding matters only when a caller sizes the button to its
    // CONTENT — `alignSelf: "flex-start"` for an inline action, say. Every
    // other button in the app is full-width, where the stretch supplies the
    // side room and centring hides the omission; the one inline caller (the
    // delete-account action) rendered as a label with the border drawn flush
    // against the text on both sides, which is what made it look dropped in
    // rather than designed. Harmless on a stretched button: the content is
    // centred either way.
    paddingHorizontal: 20,
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
  // Destructive actions, in the palette the app already uses for them
  // (colors.error / errorContainer — the same pair the error banners and the
  // discrepancy screens use). Same metrics as every other variant: only the
  // colour language changes, so a delete button still reads as one of this
  // app's buttons rather than a foreign control.
  danger: {
    backgroundColor: colors.errorContainer,
    borderWidth: 1,
    borderColor: `${colors.error}33`,
  },
  // White + a subtle gray border rather than the app's own surface tokens —
  // this button represents Google, not Al Assema, so it stays neutral like
  // every other "Sign in with Google" button regardless of host app theme.
  google: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#dadce0",
  },
  inactive: { opacity: 0.6 },
  pressed: { opacity: 0.85 },
  content: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  label: { fontSize: type.body.fontSize, fontFamily: "Cairo_700Bold" },
  labelPrimary: { color: colors.onPrimary },
  labelSecondary: { color: colors.onSurface },
  labelDanger: { color: colors.onErrorContainer },
  labelGoogle: { color: "#3c4043" },
});
