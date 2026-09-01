import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { colors, type } from "@alassema/core";
import { textStart } from "@alassema/mobile-shared";

/**
 * The hard-confirm every consequential action in this phase shares
 * (deactivate/delete a staff account, toggle maintenance mode) — a single
 * Alert.alert two-button confirm was enough for phase 8-10's deletes, but
 * this phase's own note calls maintenance mode "the single most
 * consequential control in the app" and asks for something more deliberate
 * than a tap. The confirm button stays disabled until the admin types the
 * exact phrase back — impossible to trigger by a reflexive double-tap.
 */
export default function DangerConfirm({
  visible,
  title,
  consequence,
  confirmPhrase,
  confirmLabel = "تأكيد",
  busy,
  onConfirm,
  onClose,
}: {
  visible: boolean;
  title: string;
  consequence: string;
  /** The exact phrase the admin must type to enable the confirm button. */
  confirmPhrase: string;
  confirmLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const [typed, setTyped] = useState("");
  const matches = typed.trim() === confirmPhrase;

  function handleClose() {
    setTyped("");
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <Pressable style={styles.backdrop} onPress={handleClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.consequence}>{consequence}</Text>
          <Text style={styles.instruction}>
            اكتب "<Text style={styles.phrase}>{confirmPhrase}</Text>" للتأكيد
          </Text>
          <TextInput
            style={styles.input}
            value={typed}
            onChangeText={setTyped}
            placeholder={confirmPhrase}
            placeholderTextColor={colors.onSurfaceVariant}
            autoCapitalize="none"
            autoCorrect={false}
            textAlign={textStart === "right" ? "right" : "left"}
          />
          <Pressable
            style={[styles.confirmBtn, !matches && styles.confirmBtnDisabled]}
            disabled={!matches || busy}
            onPress={onConfirm}
          >
            <Text style={styles.confirmLabel}>{busy ? "..." : confirmLabel}</Text>
          </Pressable>
          <Pressable style={styles.cancel} onPress={handleClose}>
            <Text style={styles.cancelLabel}>إلغاء</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, gap: 12 },
  title: { fontSize: type.title.fontSize, fontFamily: "Alexandria_700Bold", color: colors.onSurface, textAlign: "center" },
  consequence: { fontSize: type.body.fontSize, fontFamily: "Cairo_400Regular", color: colors.onSurfaceVariant, textAlign: "center", lineHeight: 20 },
  instruction: { fontSize: type.label.fontSize, fontFamily: "Cairo_600SemiBold", color: colors.onSurface, textAlign: "center" },
  phrase: { color: colors.error, fontFamily: "Cairo_700Bold" },
  input: {
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: type.body.fontSize,
    fontFamily: "Cairo_400Regular",
    color: colors.onSurface,
    backgroundColor: colors.surfaceContainer,
  },
  confirmBtn: { backgroundColor: colors.error, borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  confirmBtnDisabled: { opacity: 0.4 },
  confirmLabel: { fontFamily: "Cairo_700Bold", fontSize: type.label.fontSize, color: colors.onError },
  cancel: { paddingVertical: 10, alignItems: "center" },
  cancelLabel: { fontSize: type.body.fontSize, fontFamily: "Cairo_600SemiBold", color: colors.onSurfaceVariant },
});
