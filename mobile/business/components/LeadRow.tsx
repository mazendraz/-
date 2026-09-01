import { Pressable, StyleSheet, Text, View } from "react-native";
import type { ApiLead } from "@alassema/core";
import { colors, type } from "@alassema/core";
import { textStart } from "@alassema/mobile-shared";
import StatusPill from "./StatusPill";
import { formatEgp } from "../lib/money";

function relativeTime(epochMs: number): string {
  const diffMin = Math.max(0, Math.round((Date.now() - epochMs) / 60_000));
  if (diffMin < 1) return "دلوقتي";
  if (diffMin < 60) return `من ${diffMin} دقيقة`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `من ${diffHr} ساعة`;
  const diffDay = Math.round(diffHr / 24);
  return `من ${diffDay} يوم`;
}

/** Estimate range or a snapshot-price summary line — never re-derived from
 *  the current catalog, only from what's on the lead itself. */
function estimateLine(lead: ApiLead): string | null {
  if (lead.hasOnInspection) return "فيه بند يتحدد بعد المعاينة";
  if (lead.estimatedMin == null) return null;
  if (lead.estimatedMax != null && lead.estimatedMax !== lead.estimatedMin) {
    return `${formatEgp(lead.estimatedMin)} – ${formatEgp(lead.estimatedMax)}`;
  }
  return formatEgp(lead.estimatedMin);
}

export default function LeadRow({
  lead,
  onPress,
  showCompany,
}: {
  lead: ApiLead;
  onPress: () => void;
  /** Admin's all-companies list only (phase 8) — the provider screens never
   *  pass this, since every lead there is already known to be their own. */
  showCompany?: boolean;
}) {
  const estimate = estimateLine(lead);

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <View style={styles.top}>
        <Text style={styles.service} numberOfLines={1}>
          {lead.service}
        </Text>
        <StatusPill status={lead.status} />
      </View>

      <Text style={styles.name} numberOfLines={1}>
        {lead.name} · {lead.district}
        {showCompany ? ` · ${lead.companyName}` : ""}
      </Text>

      <View style={styles.bottom}>
        <Text style={styles.ref}>{lead.refNumber}</Text>
        <Text style={styles.time}>{relativeTime(lead.createdAt)}</Text>
        {estimate ? <Text style={styles.estimate}>{estimate}</Text> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    padding: 14,
    gap: 6,
  },
  pressed: { opacity: 0.7 },
  top: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", gap: 8 },
  service: {
    flex: 1,
    fontSize: type.body.fontSize,
    fontFamily: "Cairo_700Bold",
    color: colors.onSurface,
    textAlign: textStart,
  },
  name: {
    fontSize: type.label.fontSize,
    fontFamily: "Cairo_400Regular",
    color: colors.onSurfaceVariant,
    textAlign: textStart,
  },
  bottom: { flexDirection: "row-reverse", alignItems: "center", gap: 10, flexWrap: "wrap" },
  ref: {
    fontSize: type.caption.fontSize,
    fontFamily: "Cairo_500Medium",
    color: colors.outline,
  },
  time: {
    fontSize: type.caption.fontSize,
    fontFamily: "Cairo_400Regular",
    color: colors.outline,
  },
  estimate: {
    fontSize: type.caption.fontSize,
    fontFamily: "Cairo_600SemiBold",
    color: colors.primary,
    marginStart: "auto",
  },
});
