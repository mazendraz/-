import { StyleSheet, Text, View } from "react-native";
import type { ApiLeadStatus } from "@alassema/core";
import { colors, type } from "@alassema/core";

/**
 * A lead's status, as a colored pill. Same five statuses and color intent as
 * mobile/client's own StatusPill, but staff-facing labels: the client app's
 * copy is written from the customer's side ("استلمنا الطلب" — "we got your
 * request"); a provider or admin needs the operational status name, not
 * narrative reassurance copy.
 */
const STYLE: Record<ApiLeadStatus, { bg: string; fg: string; label: string }> = {
  New: { bg: "#dbeafe", fg: "#1d4ed8", label: "جديد" },
  Contacted: { bg: "#fef9c3", fg: "#a16207", label: "تم التواصل" },
  "In Progress": { bg: "#ffedd5", fg: "#c2410c", label: "قيد التنفيذ" },
  Completed: { bg: colors.successContainer, fg: colors.onSuccessContainer, label: "مكتمل" },
  Cancelled: { bg: colors.surfaceContainer, fg: colors.outline, label: "ملغي" },
};

export default function StatusPill({ status }: { status: ApiLeadStatus }) {
  const s = STYLE[status];
  return (
    <View style={[styles.pill, { backgroundColor: s.bg }]}>
      <Text style={[styles.label, { color: s.fg }]}>{s.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, alignSelf: "flex-start" },
  label: { fontSize: type.caption.fontSize, fontFamily: "Cairo_700Bold" },
});
