import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { ApiMaintenanceStatus } from "@alassema/core";
import { colors, type } from "@alassema/core";
import Logo from "./Logo";

/**
 * Full-screen maintenance notice. Rendered in place of the whole app while
 * maintenance is enabled — see @alassema/mobile-shared's useMaintenance and
 * app/_layout.tsx's gate order.
 *
 * Now at visual parity with mobile/client's own MaintenanceScreen (real
 * <Logo>, no icon glyphs otherwise) — this app previously had no equivalent
 * of the client's public-facing <Logo>/useSettings branding layer, deferred
 * from phase 2 to phase 13/14's branding pass, which is what built it.
 */
export default function MaintenanceScreen({
  status,
  onRetry,
}: {
  status: ApiMaintenanceStatus;
  onRetry: () => void;
}) {
  const title = status.title_ar.trim() || "بنطوّر حاجات حلوة";
  const message =
    status.message_ar.trim() ||
    "العاصمة تحت الصيانة المجدولة دلوقتي. هنرجع خلال وقت قصير — شكرًا لصبرك.";

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.card}>
        <Logo size={64} />
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.message}>{message}</Text>

        {status.eta != null && <Countdown eta={status.eta} />}

        <Pressable style={styles.retryBtn} onPress={onRetry}>
          <Text style={styles.retryText}>حاول تاني</Text>
        </Pressable>
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
  };
}

function Countdown({ eta }: { eta: number }) {
  const [remaining, setRemaining] = useState(() => eta - Date.now());

  useEffect(() => {
    const id = setInterval(() => setRemaining(eta - Date.now()), 1000);
    return () => clearInterval(id);
  }, [eta]);

  if (remaining <= 0) return <Text style={styles.backSoon}>بنرجع حالًا</Text>;

  const { days, hours, minutes } = breakdown(remaining);
  const parts: string[] = [];
  if (days > 0) parts.push(`${days} يوم`);
  if (days > 0 || hours > 0) parts.push(`${hours} ساعة`);
  parts.push(`${minutes} دقيقة`);

  return <Text style={styles.backSoon}>هنرجع بعد {parts.join(" و")}</Text>;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surfaceContainer,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  card: { width: "100%", maxWidth: 380, alignItems: "center", gap: 10 },
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
  backSoon: {
    fontFamily: "Cairo_700Bold",
    fontSize: type.label.fontSize,
    color: colors.primary,
    marginTop: 8,
  },
  retryBtn: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingHorizontal: 22,
    paddingVertical: 13,
    marginTop: 16,
  },
  retryText: { fontFamily: "Cairo_700Bold", fontSize: type.label.fontSize, color: colors.onPrimary },
});
