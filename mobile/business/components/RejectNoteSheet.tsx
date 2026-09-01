import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { colors, type } from "@alassema/core";
import { textStart } from "@alassema/mobile-shared";

/** An optional note before confirming a rejection — shown for every queue
 *  that accepts one (change requests via `reviewNote`; the others have no
 *  reason field server-side, so the caller decides whether to pass this
 *  component's note through at all — see api's PATCH bodies). */
export default function RejectNoteSheet({
  visible,
  onConfirm,
  onClose,
  busy,
}: {
  visible: boolean;
  onConfirm: (note: string) => void;
  onClose: () => void;
  busy?: boolean;
}) {
  const [note, setNote] = useState("");

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>سبب الرفض (اختياري)</Text>
          <TextInput
            style={styles.input}
            value={note}
            onChangeText={setNote}
            placeholder="اكتب سبب الرفض عشان يظهر لمقدّم الخدمة..."
            placeholderTextColor={colors.onSurfaceVariant}
            multiline
            textAlign={textStart === "right" ? "right" : "left"}
          />
          <Pressable
            style={styles.confirm}
            disabled={busy}
            onPress={() => {
              onConfirm(note.trim());
              setNote("");
            }}
          >
            <Text style={styles.confirmLabel}>{busy ? "..." : "تأكيد الرفض"}</Text>
          </Pressable>
          <Pressable style={styles.cancel} onPress={onClose}>
            <Text style={styles.cancelLabel}>إلغاء</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, gap: 12 },
  title: { fontSize: type.title.fontSize, fontFamily: "Alexandria_700Bold", color: colors.onSurface, textAlign: "center" },
  input: {
    minHeight: 80,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: 10,
    padding: 12,
    fontSize: type.body.fontSize,
    fontFamily: "Cairo_400Regular",
    color: colors.onSurface,
    textAlignVertical: "top",
  },
  confirm: { backgroundColor: colors.error, borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  confirmLabel: { fontFamily: "Cairo_700Bold", fontSize: type.label.fontSize, color: colors.onError },
  cancel: { paddingVertical: 10, alignItems: "center" },
  cancelLabel: { fontSize: type.body.fontSize, fontFamily: "Cairo_600SemiBold", color: colors.onSurfaceVariant },
});
