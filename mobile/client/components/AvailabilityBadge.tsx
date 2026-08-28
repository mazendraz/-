import { StyleSheet, Text, View } from "react-native";
import { colors, type } from "@alassema/core";
import Icon, { type IconName } from "./Icon";
import { availabilityLabel } from "../lib/availability";

const STYLE: Record<"busy" | "upcoming" | "free", { bg: string; fg: string; icon: IconName }> = {
  busy: { bg: "#fef3c7", fg: "#92400e", icon: "event_busy" },
  upcoming: { bg: colors.surfaceContainer, fg: colors.onSurfaceVariant, icon: "schedule" },
  free: { bg: "#dcfce7", fg: "#15803d", icon: "check_circle" },
};

/**
 * One-line availability chip — the mobile counterpart of the website's
 * AvailabilityBadge in CompanyProfile.tsx. Reads the server-derived fields
 * (busy / nextAvailableAt / upcomingBusyFrom) rather than recomputing, same
 * reasoning as the website: a second implementation could disagree with the
 * CTA on the same screen about whether the company is actually bookable.
 */
export default function AvailabilityBadge({
  company,
}: {
  company: {
    busy?: boolean | null;
    busyUntil?: number | null;
    nextAvailableAt?: number | null;
    upcomingBusyFrom?: number | null;
    responseTime?: string;
  };
}) {
  const { state, text } = availabilityLabel(company);
  const s = STYLE[state];

  return (
    <View style={[styles.badge, { backgroundColor: s.bg }]}>
      <Icon name={s.icon} size={13} color={s.fg} />
      <Text style={[styles.text, { color: s.fg }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { flexDirection: "row-reverse", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, alignSelf: "flex-start" },
  text: { fontFamily: "Cairo_700Bold", fontSize: 11 },
});
