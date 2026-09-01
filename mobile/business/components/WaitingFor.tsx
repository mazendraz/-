import { StyleSheet, Text } from "react-native";
import { colors, type } from "@alassema/core";

/** "منتظر من ساعتين" — how long an item has been sitting in a queue,
 *  distinct from LeadRow/ThreadRow's own relativeTime() (which reads "من
 *  ساعتين" without the verb): a queue's whole point is the wait, so this one
 *  says so explicitly. Turns red past 48h — a queue this old is the actual
 *  problem the phone-native approvals screen exists to prevent. */
export default function WaitingFor({ createdAt }: { createdAt: number }) {
  const diffMin = Math.max(0, Math.round((Date.now() - createdAt) / 60_000));
  const stale = diffMin > 48 * 60;

  let label: string;
  if (diffMin < 1) label = "منتظر من لحظات";
  else if (diffMin < 60) label = `منتظر من ${diffMin} دقيقة`;
  else if (diffMin < 24 * 60) label = `منتظر من ${Math.round(diffMin / 60)} ساعة`;
  else label = `منتظر من ${Math.round(diffMin / (24 * 60))} يوم`;

  return <Text style={[styles.text, stale && styles.stale]}>{label}</Text>;
}

const styles = StyleSheet.create({
  text: { fontSize: type.caption.fontSize, fontFamily: "Cairo_500Medium", color: colors.onSurfaceVariant },
  stale: { color: colors.error, fontFamily: "Cairo_700Bold" },
});
