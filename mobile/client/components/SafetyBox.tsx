import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { colors, type } from "@alassema/core";
import { rowStart, useSettings } from "@alassema/mobile-shared";
import Icon from "./Icon";

/**
 * "إزاي بنحميك" — the four things Al Assema does about the risk a customer is
 * actually weighing. Mobile counterpart of the website's SafetyBox
 * (app/src/components/SafetyBox.tsx); the wording is kept identical on purpose,
 * because a customer who reads the promise on the site and doesn't find it in
 * the app has learned that the promise is marketing.
 *
 * Point 3 ("كلّمنا إحنا، مش هما") is the one that does the work, and the one
 * with a real cost: it is a commitment to pick up. It ships with the WhatsApp
 * button beside it deliberately — a promise the reader can act on in one tap is
 * a promise; the same words with no way to reach anyone are decoration, and a
 * broken promise is worse than no promise.
 */
const POINTS = [
  "كل شركة متحقّق منها بسجل تجاري قبل ما تدخل المنصة",
  "عرض السعر بيوصلك مكتوب — شامل التوريد والتركيب والضمان ومدة التنفيذ",
  "لو الشركة اتأخرت أو الشغل مش مطابق للعرض — كلّمنا إحنا، مش هما",
  "طلبك ليه رقم مسجّل عندنا تقدر ترجعلنا بيه في أي وقت",
];

export default function SafetyBox({ style }: { style?: object }) {
  const settings = useSettings();
  // The PLATFORM's number, not the company's — the whole point of point 3 is
  // that it routes around the provider.
  const wa = (settings.public_phone ?? "").replace(/[^\d]/g, "");

  return (
    <View style={[styles.card, style]}>
      <View style={styles.titleRow}>
        <Icon name="shield" size={20} color={colors.primary} />
        <Text style={styles.title}>إزاي بنحميك</Text>
      </View>

      {POINTS.map((point, i) => (
        <View key={point} style={styles.row}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{i + 1}</Text>
          </View>
          <Text style={styles.text}>{point}</Text>
        </View>
      ))}

      {wa ? (
        <Pressable
          style={styles.cta}
          onPress={() => Linking.openURL(`https://wa.me/${wa}`).catch(() => {})}
        >
          <Icon name="chat" size={18} color={colors.onPrimary} />
          <Text style={styles.ctaText}>كلّمنا على واتساب</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: 20,
    padding: 18,
    gap: 12,
  },
  titleRow: { flexDirection: rowStart, alignItems: "center", gap: 8 },
  title: {
    fontFamily: "Alexandria_800ExtraBold",
    fontSize: type.body.fontSize,
    color: colors.onSurface,
  },
  row: { flexDirection: rowStart, alignItems: "flex-start", gap: 10 },
  badge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.primaryContainer,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    fontFamily: "Cairo_700Bold",
    fontSize: type.caption.fontSize,
    color: colors.primary,
  },
  text: {
    flex: 1,
    fontFamily: "Cairo_400Regular",
    fontSize: type.label.fontSize,
    lineHeight: 22,
    color: colors.onSurface,
    textAlign: "right",
  },
  cta: {
    flexDirection: rowStart,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 4,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: colors.primary,
  },
  ctaText: {
    fontFamily: "Cairo_700Bold",
    fontSize: type.label.fontSize,
    color: colors.onPrimary,
  },
});
