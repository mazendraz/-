import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import type { ApiLeadStatus } from "@alassema/core";
import { colors, type } from "@alassema/core";

const LABELS: Record<ApiLeadStatus, string> = {
  New: "جديد",
  Contacted: "تم التواصل",
  "In Progress": "قيد التنفيذ",
  Completed: "مكتمل",
  Cancelled: "ملغي",
};

/**
 * The server's own forward-only state machine — api's leads.service.ts
 * `LEAD_TRANSITIONS`, mirrored exactly. A lead only ever moves forward
 * (New → Contacted/In Progress/Completed/Cancelled, Contacted → In
 * Progress/Completed/Cancelled, In Progress → Completed/Cancelled);
 * Completed and Cancelled are terminal. The server enforces this
 * unconditionally (a claimed `updateMany` with `status: { in: sourcesFor
 * (target) }`), so offering a status the current one can't reach isn't a
 * soft suggestion the server might allow — it is guaranteed to 409. Found
 * live: attempting Contacted → New here returned "A request cannot move
 * from CONTACTED to NEW."
 */
const LEAD_TRANSITIONS: Record<ApiLeadStatus, ApiLeadStatus[]> = {
  New: ["Contacted", "In Progress", "Completed", "Cancelled"],
  Contacted: ["In Progress", "Completed", "Cancelled"],
  "In Progress": ["Completed", "Cancelled"],
  Completed: [],
  Cancelled: [],
};

/**
 * Status-change sheet. Only offers the current status (shown, disabled) plus
 * whatever it can legally move to — see LEAD_TRANSITIONS above.
 *
 * `allowCompleted` defaults to false: a PROVIDER cannot reach "Completed"
 * through PATCH /leads/[id] at all — the server's `requireCompletion` flag
 * rejects it (see lib/leads.ts's updateLeadStatus). Hiding the direct option
 * means the provider discovers the rule from the UI routing them to the
 * completion flow instead, not from a 400 they didn't expect. The admin
 * screen (phase 8) passes `allowCompleted` and handles the tap by calling
 * updateLeadStatus directly — an admin CAN set it that way.
 */
export default function StatusSheet({
  visible,
  current,
  allowCompleted = false,
  onSelect,
  onRequestComplete,
  onClose,
}: {
  visible: boolean;
  current: ApiLeadStatus;
  allowCompleted?: boolean;
  onSelect: (status: ApiLeadStatus) => void;
  /** Only called when a non-admin taps "Completed" — see the header comment. */
  onRequestComplete?: () => void;
  onClose: () => void;
}) {
  const ALL_STATUSES: ApiLeadStatus[] = ["New", "Contacted", "In Progress", "Completed", "Cancelled"];
  const reachable = new Set<ApiLeadStatus>(LEAD_TRANSITIONS[current]);
  const options = ALL_STATUSES.filter((status) => status === current || reachable.has(status));

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>غيّر الحالة</Text>

          {current === "Completed" || current === "Cancelled" ? (
            <Text style={styles.terminalNote}>
              الطلب {current === "Completed" ? "مكتمل" : "ملغي"} ومقفول — مفيش تغيير حالة بعد كده.
            </Text>
          ) : null}

          {options.map((status) => {
            const isCurrent = status === current;
            const isCompleted = status === "Completed";
            const routesToCompletion = isCompleted && !allowCompleted;
            return (
              <Pressable
                key={status}
                disabled={isCurrent}
                style={[styles.option, isCurrent && styles.optionActive]}
                onPress={() => {
                  if (routesToCompletion) {
                    onRequestComplete?.();
                  } else {
                    onSelect(status);
                  }
                }}
              >
                <Text style={[styles.optionLabel, isCurrent && styles.optionLabelActive]}>
                  {LABELS[status]}
                  {isCurrent ? " (الحالية)" : ""}
                </Text>
                {routesToCompletion ? <Text style={styles.hint}>يحتاج تسجيل مبلغ نهائي</Text> : null}
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
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    gap: 4,
  },
  title: {
    fontSize: type.title.fontSize,
    fontFamily: "Alexandria_700Bold",
    color: colors.onSurface,
    marginBottom: 12,
    textAlign: "center",
  },
  terminalNote: {
    fontSize: type.caption.fontSize,
    fontFamily: "Cairo_500Medium",
    color: colors.onSurfaceVariant,
    textAlign: "center",
    marginBottom: 8,
  },
  option: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  optionActive: { backgroundColor: colors.surfaceContainer },
  optionLabel: {
    fontSize: type.body.fontSize,
    fontFamily: "Cairo_600SemiBold",
    color: colors.onSurface,
    textAlign: "center",
  },
  optionLabelActive: { color: colors.onSurfaceVariant },
  hint: {
    fontSize: type.caption.fontSize,
    fontFamily: "Cairo_400Regular",
    color: colors.onSurfaceVariant,
    textAlign: "center",
    marginTop: 2,
  },
  cancel: { marginTop: 8, paddingVertical: 14, alignItems: "center" },
  cancelLabel: { fontSize: type.body.fontSize, fontFamily: "Cairo_600SemiBold", color: colors.error },
});
