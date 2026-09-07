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
/**
 * ── Why these are tints and not the chart's own colours ────────────────────
 * `STATUS_HEX` in @alassema/core is a set of FILL colours, picked so that
 * neighbouring arcs of the status donut stay apart for a colourblind reader.
 * A pill is text on a background and has a different requirement: the label
 * has to clear a text-contrast ratio against its own tint. So each row below
 * is a light tint of the chart hue plus a dark ink from the same family —
 * same identity, different job.
 *
 * "قيد التنفيذ" is the one that moved: its ink is now the chart's own
 * `#9a3412`, which both matches the donut and reads better on the tint than
 * the lighter `#c2410c` it replaced.
 */
const STYLE: Record<ApiLeadStatus, { bg: string; fg: string; label: string }> = {
  New: { bg: "#dbeafe", fg: "#1d4ed8", label: "جديد" },
  Contacted: { bg: "#fef3c7", fg: "#92400e", label: "تم التواصل" },
  "In Progress": { bg: "#ffedd5", fg: "#9a3412", label: "قيد التنفيذ" },
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
