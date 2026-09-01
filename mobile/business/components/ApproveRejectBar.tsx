import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, type } from "@alassema/core";

export default function ApproveRejectBar({
  onApprove,
  onReject,
  approveLabel = "موافقة",
  rejectLabel = "رفض",
  busy,
}: {
  onApprove: () => void;
  onReject: () => void;
  approveLabel?: string;
  rejectLabel?: string;
  busy?: boolean;
}) {
  return (
    <View style={styles.row}>
      <Pressable style={[styles.btn, styles.reject]} disabled={busy} onPress={onReject}>
        <Text style={styles.rejectLabel}>{rejectLabel}</Text>
      </Pressable>
      <Pressable style={[styles.btn, styles.approve]} disabled={busy} onPress={onApprove}>
        <Text style={styles.approveLabel}>{busy ? "..." : approveLabel}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row-reverse", gap: 10 },
  btn: { flex: 1, borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  approve: { backgroundColor: colors.primary },
  approveLabel: { fontFamily: "Cairo_700Bold", fontSize: type.label.fontSize, color: colors.onPrimary },
  reject: { backgroundColor: colors.errorContainer },
  rejectLabel: { fontFamily: "Cairo_700Bold", fontSize: type.label.fontSize, color: colors.onErrorContainer },
});
