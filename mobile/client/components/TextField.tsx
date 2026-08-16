import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";
import { colors, type } from "@alassema/core";

/**
 * A labeled text input. `secure` swaps in a show/hide toggle — the mobile
 * counterpart of the website's PasswordField, and for the same reason: a
 * password typed blind with no way to check it is the single biggest source
 * of "wrong password" on a first attempt.
 *
 * No `dir="ltr"` trick here the way the website needed one: RN has no CSS
 * logical-property/physical-property split to get out of sync (see that
 * component's comment on WHY the web needed one) — `I18nManager.forceRTL`
 * mirrors layout at the layout-engine level, and text alignment is set
 * explicitly below rather than left to inherit, so this can't drift the same
 * way.
 */
export default function TextField({
  label,
  value,
  onChangeText,
  secure = false,
  keyboardType,
  autoCapitalize = "sentences",
  autoComplete,
  placeholder,
  hint,
  ltr = false,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  secure?: boolean;
  keyboardType?: TextInputProps["keyboardType"];
  autoCapitalize?: TextInputProps["autoCapitalize"];
  autoComplete?: TextInputProps["autoComplete"];
  placeholder?: string;
  hint?: string;
  /** Email addresses and passwords read left-to-right even on an Arabic
   *  screen — same reasoning as the website's PasswordField, minus the
   *  padding/logical-property trap that made that one tricky. */
  ltr?: boolean;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputRow}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={secure && !visible}
          keyboardType={keyboardType}
          autoCapitalize={secure || ltr ? "none" : autoCapitalize}
          autoComplete={autoComplete}
          placeholder={placeholder}
          placeholderTextColor={colors.outline}
          style={[styles.input, ltr && styles.ltrText, secure && styles.inputWithToggle]}
          textAlign={ltr ? "left" : "right"}
        />
        {secure && (
          <Pressable
            onPress={() => setVisible((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel={visible ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
            style={styles.toggle}
          >
            <Text style={styles.toggleText}>{visible ? "إخفاء" : "إظهار"}</Text>
          </Pressable>
        )}
      </View>
      {hint && <Text style={styles.hint}>{hint}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: 6 },
  label: {
    fontSize: type.caption.fontSize,
    fontFamily: "Cairo_700Bold",
    color: colors.onSurfaceVariant,
    textAlign: "right",
  },
  inputRow: { position: "relative", justifyContent: "center" },
  input: {
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: type.body.fontSize,
    fontFamily: "Cairo_400Regular",
    color: colors.onSurface,
    backgroundColor: colors.surfaceContainerLowest,
  },
  // Physical (paddingRight), not logical (paddingEnd) — deliberately. This
  // field only ever holds Latin content (see the `ltr` prop) inside a page
  // forced RTL by I18nManager, and `insetInlineStart`/`paddingEnd` resolve
  // against the PAGE's direction, not the field's — so a logical pairing here
  // put the toggle on one physical side and its reserved padding on the other,
  // and the toggle rendered on top of the input text instead of beside it.
  // CSS would fix this by scoping `dir="ltr"` to the field's own wrapper (see
  // the website's PasswordField); React Native has no per-subtree direction
  // override, so the fixed side is spelled out explicitly instead, on both the
  // padding and the toggle's position, so they can't point opposite ways again.
  inputWithToggle: { paddingRight: 64 },
  ltrText: { writingDirection: "ltr" },
  toggle: { position: "absolute", right: 12, paddingVertical: 4, paddingHorizontal: 4 },
  toggleText: { fontSize: type.caption.fontSize, fontFamily: "Cairo_600SemiBold", color: colors.primary },
  hint: {
    fontSize: type.caption.fontSize,
    fontFamily: "Cairo_400Regular",
    color: colors.outline,
    textAlign: "right",
  },
});
