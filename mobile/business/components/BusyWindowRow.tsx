import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, type } from "@alassema/core";
import { textStart } from "@alassema/mobile-shared";
import type { ApiBusyWindow } from "../lib/availability";

function fmt(epochMs: number): string {
  return new Date(epochMs).toLocaleDateString("ar-EG", { day: "numeric", month: "short" });
}

export default function BusyWindowRow({ window, onDelete }: { window: ApiBusyWindow; onDelete: () => void }) {
  const range = window.endsAt ? `${fmt(window.startsAt)} — ${fmt(window.endsAt)}` : `من ${fmt(window.startsAt)} — لحد ما تتقفل يدويًا`;

  return (
    <View style={styles.row}>
      <View style={styles.info}>
        <Text style={styles.range}>{range}</Text>
        {window.note ? <Text style={styles.note}>{window.note}</Text> : null}
        {window.createdByAdmin ? <Text style={styles.adminTag}>حدّدها الأدمن</Text> : null}
      </View>
      {/* An admin-created window returns 403 on delete server-side — hide the
          action entirely rather than let the tap fail. */}
      {!window.createdByAdmin ? (
        <Pressable style={styles.deleteBtn} onPress={onDelete}>
          <Text style={styles.deleteLabel}>حذف</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: 12,
    padding: 12,
    gap: 10,
  },
  info: { flex: 1, gap: 2 },
  range: { fontSize: type.body.fontSize, fontFamily: "Cairo_600SemiBold", color: colors.onSurface, textAlign: textStart },
  note: { fontSize: type.caption.fontSize, fontFamily: "Cairo_400Regular", color: colors.onSurfaceVariant, textAlign: textStart },
  adminTag: { fontSize: type.caption.fontSize, fontFamily: "Cairo_600SemiBold", color: colors.primary, textAlign: textStart, marginTop: 2 },
  deleteBtn: { backgroundColor: colors.errorContainer, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7 },
  deleteLabel: { fontFamily: "Cairo_700Bold", fontSize: type.caption.fontSize, color: colors.onErrorContainer },
});
