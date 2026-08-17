import { StyleSheet, Text, View } from "react-native";
import type { ApiLeadStatus } from "@alassema/core";
import { colors, type } from "@alassema/core";

/**
 * A lead's status, as a colored pill — mirrors the website's STATUS_STYLE map
 * in MyRequests.tsx (same five statuses, same color intent) so a customer who
 * uses both sees a consistent read on what each color means.
 */
const STYLE: Record<ApiLeadStatus, { bg: string; fg: string; label: string }> = {
  New: { bg: "#dbeafe", fg: "#1d4ed8", label: "استلمنا الطلب" },
  Contacted: { bg: "#fef9c3", fg: "#a16207", label: "بنتواصل معاك" },
  "In Progress": { bg: "#ffedd5", fg: "#c2410c", label: "شغل جاري" },
  Completed: { bg: colors.successContainer, fg: colors.onSuccessContainer, label: "خلص" },
  Cancelled: { bg: colors.surfaceContainer, fg: colors.outline, label: "اتلغى" },
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
