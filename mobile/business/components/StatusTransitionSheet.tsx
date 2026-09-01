import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import type { ApiTransactionStatus } from "@alassema/core";
import { colors, type } from "@alassema/core";

const LABELS: Record<ApiTransactionStatus, string> = {
  PENDING: "معلّقة",
  COLLECTED: "محصّلة",
  DISPUTED: "متنازع عليها",
  VOID: "ملغاة",
};

// No server-side transition graph exists for transactions (confirmed
// against finance.service.ts's updateTransactionStatus — any status may
// move to any other), unlike leads' own strict LEAD_TRANSITIONS. Every
// other status is offered.
const ALL_STATUSES: ApiTransactionStatus[] = ["PENDING", "COLLECTED", "DISPUTED", "VOID"];

export default function StatusTransitionSheet({
  visible,
  current,
  busy,
  onSelect,
  onClose,
}: {
  visible: boolean;
  current: ApiTransactionStatus;
  busy?: boolean;
  onSelect: (status: ApiTransactionStatus) => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>تغيير حالة المعاملة</Text>
          {ALL_STATUSES.map((status) => {
            const isCurrent = status === current;
            return (
              <Pressable
                key={status}
                disabled={isCurrent || busy}
                style={[styles.option, isCurrent && styles.optionActive]}
                onPress={() => onSelect(status)}
              >
                <Text style={[styles.optionLabel, isCurrent && styles.optionLabelActive]}>
                  {LABELS[status]}{isCurrent ? " (الحالية)" : ""}
                </Text>
              </Pressable>
            );
          })}
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
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, gap: 4 },
  title: { fontSize: type.title.fontSize, fontFamily: "Alexandria_700Bold", color: colors.onSurface, marginBottom: 12, textAlign: "center" },
  option: { paddingVertical: 14, paddingHorizontal: 16, borderRadius: 12 },
  optionActive: { backgroundColor: colors.surfaceContainer },
  optionLabel: { fontSize: type.body.fontSize, fontFamily: "Cairo_600SemiBold", color: colors.onSurface, textAlign: "center" },
  optionLabelActive: { color: colors.onSurfaceVariant },
  cancel: { marginTop: 8, paddingVertical: 14, alignItems: "center" },
  cancelLabel: { fontSize: type.body.fontSize, fontFamily: "Cairo_600SemiBold", color: colors.error },
});
