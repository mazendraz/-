import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import {
  LEAD_LOSS_REASONS,
  LEAD_LOSS_REASON_LABELS_AR,
  LOSS_NOTE_REQUIRED_FOR,
  checkLossReason,
  colors,
  type,
  type ApiLeadLossReason,
} from "@alassema/core";

export interface LossPayload {
  lossReason: ApiLeadLossReason;
  lossNote?: string;
}

/**
 * Asks why a request is being cancelled — the API refuses the transition
 * without an answer (api's leads.service.updateStatus), so this is not an
 * optional nicety the sheet could skip: without it, tapping "ملغي" would
 * return a 400 the provider has no way to satisfy.
 *
 * The reason list and the "OTHER needs a note" rule both come from
 * @alassema/core, the same module the website and the API read, so the three
 * cannot drift into offering different reasons.
 */
export default function LossReasonSheet({ visible, busy, onConfirm, onClose }: {
  visible: boolean;
  busy?: boolean;
  onConfirm: (loss: LossPayload) => void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState<ApiLeadLossReason | null>(null);
  const [note, setNote] = useState("");
  const [touched, setTouched] = useState(false);

  const problem = checkLossReason(reason, note);
  const noteRequired = reason != null && LOSS_NOTE_REQUIRED_FOR.includes(reason);

  function close() {
    if (busy) return;
    setReason(null);
    setNote("");
    setTouched(false);
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>الطلب اتلغى ليه؟</Text>
          <Text style={styles.desc}>
            طلب ملغي من غير سبب مكتوب مش هيقولك حاجة الشهر الجاي. اختار أقرب سبب.
          </Text>

          <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
            {LEAD_LOSS_REASONS.map((r) => {
              const selected = reason === r;
              return (
                <Pressable
                  key={r}
                  onPress={() => { setReason(r); setTouched(true); }}
                  style={[styles.option, selected && styles.optionSelected]}
                >
                  <Text style={[styles.optionLabel, selected && styles.optionLabelSelected]}>
                    {LEAD_LOSS_REASON_LABELS_AR[r]}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <TextInput
            style={styles.note}
            value={note}
            onChangeText={setNote}
            maxLength={500}
            multiline
            placeholder={noteRequired ? "اكتب باختصار اللي حصل" : "أي حاجة تستاهل تتفتكر (اختياري)"}
            placeholderTextColor={colors.outline}
            textAlign="right"
          />

          {touched && problem ? <Text style={styles.error}>{problem}</Text> : null}

          <View style={styles.actions}>
            <Pressable onPress={close} disabled={busy} style={[styles.btn, styles.btnGhost]}>
              <Text style={styles.btnGhostLabel}>رجوع</Text>
            </Pressable>
            <Pressable
              disabled={busy || problem != null}
              onPress={() => {
                setTouched(true);
                if (!problem && reason) onConfirm({ lossReason: reason, lossNote: note.trim() || undefined });
              }}
              style={[styles.btn, styles.btnDanger, (busy || problem != null) && styles.btnDisabled]}
            >
              <Text style={styles.btnDangerLabel}>ألغِ الطلب</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 32,
    maxHeight: "88%",
  },
  title: { ...type.title, color: colors.onSurface, textAlign: "right", marginBottom: 4 },
  desc: { ...type.label, color: colors.outline, textAlign: "right", marginBottom: 14, lineHeight: 20 },
  list: { maxHeight: 260, marginBottom: 12 },
  option: {
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: colors.surfaceContainer,
    marginBottom: 8,
  },
  optionSelected: { backgroundColor: colors.primaryContainer },
  optionLabel: { ...type.label, color: colors.onSurface, textAlign: "right", fontWeight: "700" },
  optionLabelSelected: { color: colors.primary },
  note: {
    ...type.label,
    color: colors.onSurface,
    backgroundColor: colors.surfaceContainer,
    borderRadius: 14,
    padding: 14,
    minHeight: 76,
    textAlignVertical: "top",
    marginBottom: 10,
  },
  error: { ...type.caption, color: colors.error, textAlign: "right", marginBottom: 10, fontWeight: "700" },
  actions: { flexDirection: "row-reverse", gap: 10 },
  btn: { flex: 1, paddingVertical: 14, borderRadius: 14, alignItems: "center" },
  btnGhost: { backgroundColor: colors.surfaceContainer },
  btnGhostLabel: { ...type.label, color: colors.onSurfaceVariant, fontWeight: "700" },
  btnDanger: { backgroundColor: colors.error },
  btnDangerLabel: { ...type.label, color: colors.onError, fontWeight: "700" },
  btnDisabled: { opacity: 0.5 },
});
