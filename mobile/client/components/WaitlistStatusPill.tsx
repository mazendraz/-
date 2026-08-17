import { StyleSheet, Text, View } from "react-native";
import type { ApiWaitlistStatus } from "@alassema/core";
import { colors, type } from "@alassema/core";

/**
 * A waitlist entry's status, as a colored pill — mirrors the website's
 * WAITLIST_STATUS_COLORS/KEYS map in availability.ts (same four statuses,
 * same color intent as StatusPill's lead statuses).
 */
const STYLE: Record<ApiWaitlistStatus, { bg: string; fg: string; label: string }> = {
  WAITING: { bg: "#fef3c7", fg: "#92400e", label: "في الانتظار" },
  NOTIFIED: { bg: "#dbeafe", fg: "#1d4ed8", label: "اتبلّغ" },
  CONVERTED: { bg: colors.successContainer, fg: colors.onSuccessContainer, label: "اتحول لطلب" },
  CANCELLED: { bg: colors.surfaceContainer, fg: colors.outline, label: "اتلغى" },
};

export default function WaitlistStatusPill({ status }: { status: ApiWaitlistStatus }) {
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
