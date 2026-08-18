import { useEffect, useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { ApiMaintenanceStatus } from "@alassema/core";
import { colors, type } from "@alassema/core";
import Logo from "./Logo";
import Icon from "./Icon";
import { useSettings } from "../lib/settings";

/**
 * Full-screen maintenance notice — the mobile counterpart of the website's
 * StatusScreen.tsx (maintenance variant only; this app has no equivalent of
 * the website's separate "backend unreachable" state to render here — see
 * app/_layout.tsx's comment on why). Rendered in place of the whole Stack
 * while maintenance is enabled (see lib/settings.ts's useMaintenance).
 */
export default function MaintenanceScreen({ status, onRetry }: { status: ApiMaintenanceStatus; onRetry: () => void }) {
  const settings = useSettings();

  const title = status.title_ar.trim() || "بنطوّر حاجات حلوة";
  const message =
    status.message_ar.trim() ||
    "العاصمة تحت الصيانة المجدولة دلوقتي. هنرجع خلال وقت قصير — شكرًا لصبرك.";
  const contact = settings.support_email?.trim();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.card}>
        <Logo size={64} />

        <View style={styles.iconCircle}>
          <Icon name="construction" size={40} color={colors.primary} />
        </View>

        <Text style={styles.title}>{title}</Text>
        <Text style={styles.message}>{message}</Text>

        {status.eta != null && <Countdown eta={status.eta} />}

        <View style={styles.actions}>
          <Pressable style={styles.retryBtn} onPress={onRetry}>
            <Icon name="refresh" size={18} color={colors.onPrimary} />
            <Text style={styles.retryText}>حاول تاني</Text>
          </Pressable>
          {contact ? (
            <Pressable style={styles.contactBtn} onPress={() => Linking.openURL(`mailto:${contact}`)}>
              <Icon name="mail" size={18} color={colors.onSurface} />
              <Text style={styles.contactText}>تواصل معانا</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </SafeAreaView>
  );
}

function breakdown(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return {
    days: Math.floor(total / 86400),
    hours: Math.floor((total % 86400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  };
}

/** Live "back in 2h 14m" countdown. Shows a plain "back very soon" once the ETA has passed. */
function Countdown({ eta }: { eta: number }) {
  const [remaining, setRemaining] = useState(() => eta - Date.now());

  useEffect(() => {
    const id = setInterval(() => setRemaining(eta - Date.now()), 1000);
    return () => clearInterval(id);
  }, [eta]);

  if (remaining <= 0) {
    return <Text style={styles.backSoon}>بنرجع حالًا</Text>;
  }

  const { days, hours, minutes, seconds } = breakdown(remaining);
  const parts: [number, string][] = [];
  if (days > 0) parts.push([days, "يوم"]);
  if (days > 0 || hours > 0) parts.push([hours, "ساعة"]);
  parts.push([minutes, "دقيقة"]);
  if (days === 0 && hours === 0) parts.push([seconds, "ثانية"]);

  return (
    <View style={styles.countdown}>
      <Text style={styles.countdownLabel}>هنرجع بعد</Text>
      <View style={styles.countdownRow}>
        {parts.map(([value, unit], i) => (
          <View key={i} style={styles.countdownPart}>
            <Text style={styles.countdownValue}>{String(value).padStart(2, "0")}</Text>
            <Text style={styles.countdownUnit}>{unit}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceContainer, alignItems: "center", justifyContent: "center", padding: 20 },
  card: { width: "100%", maxWidth: 380, alignItems: "center", gap: 10 },
  iconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.primaryContainer,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  title: {
    fontSize: type.headline.fontSize,
    fontFamily: "Alexandria_800ExtraBold",
    color: colors.onSurface,
    textAlign: "center",
    marginTop: 8,
  },
  message: {
    fontSize: type.body.fontSize,
    fontFamily: "Cairo_400Regular",
    color: colors.onSurfaceVariant,
    textAlign: "center",
    lineHeight: 22,
  },
  backSoon: { fontFamily: "Cairo_700Bold", fontSize: type.label.fontSize, color: colors.primary, marginTop: 8 },
  countdown: { alignItems: "center", gap: 6, marginTop: 10 },
  countdownLabel: { fontFamily: "Cairo_700Bold", fontSize: type.caption.fontSize, color: colors.outline },
  countdownRow: { flexDirection: "row-reverse", alignItems: "flex-end", gap: 10 },
  countdownPart: { alignItems: "center" },
  countdownValue: { fontFamily: "Alexandria_800ExtraBold", fontSize: type.headline.fontSize, color: colors.onSurface },
  countdownUnit: { fontFamily: "Cairo_700Bold", fontSize: type.caption.fontSize, color: colors.outline },
  actions: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 10, justifyContent: "center", marginTop: 16 },
  retryBtn: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  retryText: { fontFamily: "Cairo_700Bold", fontSize: type.label.fontSize, color: colors.onPrimary },
  contactBtn: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  contactText: { fontFamily: "Cairo_700Bold", fontSize: type.label.fontSize, color: colors.onSurface },
});
