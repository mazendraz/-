import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { colors, type } from "@alassema/core";
import Icon, { type IconName } from "../components/Icon";
import Button from "../components/Button";

const REASONS: { icon: IconName; title: string; desc: string }[] = [
  { icon: "check_circle", title: "شركات موثّقة", desc: "كل شركة بتنراجع قبل ما تنشر على المنصة" },
  { icon: "star", title: "جودة مضمونة", desc: "تقييمات حقيقية من عملاء استخدموا الخدمة فعلًا" },
  { icon: "hourglass_top", title: "رد سريع", desc: "الشركات بترد على طلبك في أسرع وقت" },
  { icon: "forum", title: "دعم مستمر", desc: "فريقنا موجود لو احتجت مساعدة في أي وقت" },
];

/** Why Al Assema — the mobile counterpart of the website's About.tsx. */
export default function About() {
  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Icon name="arrow_back" size={22} color={colors.onSurface} style={{ transform: [{ scaleX: -1 }] }} />
        </Pressable>
        <Text style={styles.headerTitle}>عن العاصمة</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>ليه العاصمة؟</Text>
        <Text style={styles.sub}>منصة بتوصلك بأفضل الشركات الموثوقة اللي بتقدم خدماتها في العاصمة الإدارية الجديدة.</Text>

        <View style={styles.grid}>
          {REASONS.map((r) => (
            <View key={r.title} style={styles.card}>
              <View style={styles.iconCircle}>
                <Icon name={r.icon} size={22} color={colors.primary} />
              </View>
              <Text style={styles.cardTitle}>{r.title}</Text>
              <Text style={styles.cardDesc}>{r.desc}</Text>
            </View>
          ))}
        </View>

        <View style={styles.actions}>
          <Button label="تصفّح الشركات" onPress={() => router.push("/companies")} />
          <Button label="تواصل معنا" variant="secondary" onPress={() => router.push("/contact")} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingBottom: 8 },
  headerTitle: { fontFamily: "Cairo_700Bold", fontSize: type.subhead.fontSize, color: colors.onSurface },
  scroll: { padding: 20, paddingTop: 4, gap: 6 },
  title: { fontFamily: "Alexandria_800ExtraBold", fontSize: type.headline.fontSize, color: colors.onSurface, textAlign: "right" },
  sub: { fontFamily: "Cairo_400Regular", fontSize: type.body.fontSize, color: colors.outline, textAlign: "right", lineHeight: 22, marginBottom: 16 },
  grid: { gap: 12 },
  card: { backgroundColor: colors.surfaceContainerLowest, borderRadius: 16, padding: 16, gap: 6, borderWidth: 1, borderColor: colors.outlineVariant },
  iconCircle: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.primaryContainer, alignItems: "center", justifyContent: "center", alignSelf: "flex-end" },
  cardTitle: { fontFamily: "Cairo_700Bold", fontSize: type.body.fontSize, color: colors.onSurface, textAlign: "right" },
  cardDesc: { fontFamily: "Cairo_400Regular", fontSize: type.label.fontSize, color: colors.onSurfaceVariant, textAlign: "right", lineHeight: 20 },
  actions: { gap: 10, marginTop: 20 },
});
