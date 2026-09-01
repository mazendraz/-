import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, Stack } from "expo-router";
import { colors, type } from "@alassema/core";
import { textStart } from "@alassema/mobile-shared";
import { useStaffAuth } from "../../lib/staffAuth";
import { hasDesktopPermission, hasAnyDesktopPermission, type DesktopPermission } from "../../lib/permissions";
import { EmptyCard } from "../../components/ListStates";

const MODULES: { label: string; href: string; permission: DesktopPermission | readonly DesktopPermission[] }[] = [
  { label: "نظرة عامة", href: "/control/overview", permission: ["overview:read", "analytics:read"] },
  { label: "العمليات", href: "/control/operations", permission: "operations:read" },
  { label: "المالية", href: "/control/finance", permission: ["finance:read", "analytics:read"] },
  { label: "العملاء", href: "/control/clients", permission: ["business:read", "analytics:read"] },
  { label: "أداء مقدّمي الخدمة", href: "/control/providers", permission: ["business:read", "analytics:read"] },
  { label: "تحليلات الأسعار", href: "/control/pricing", permission: "analytics:read" },
  { label: "التقارير", href: "/control/reports", permission: "reports:read" },
];

/**
 * Nav is DERIVED from the signed-in admin's own `desktopPermissions` array,
 * not a static list — phase-12's own instruction, so a partial grant never
 * shows a dead link. An admin with an empty array never gets here at all
 * (see MoreScreen.tsx, which hides the entry entirely).
 */
export default function ControlCenterHub() {
  const { user } = useStaffAuth();
  const available = MODULES.filter((m) => hasDesktopPermission(user, m.permission));

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: "لوحة التحكم" }} />
      <SafeAreaView style={styles.container} edges={["bottom"]}>
        {hasAnyDesktopPermission(user) && available.length > 0 ? (
          <View style={styles.list}>
            {available.map((m) => (
              <Pressable key={m.href} style={styles.row} onPress={() => router.push(m.href as never)}>
                <Text style={styles.label}>{m.label}</Text>
                <Text style={styles.chevron}>‹</Text>
              </Pressable>
            ))}
          </View>
        ) : (
          <EmptyCard title="مفيش صلاحيات ممنوحة" message="اطلب من أدمن تاني يضيفلك صلاحيات من شاشة الفريق." />
        )}
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  list: { borderRadius: 14, borderWidth: 1, borderColor: colors.outlineVariant, overflow: "hidden" },
  row: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.outlineVariant,
    backgroundColor: colors.surface,
  },
  label: { fontSize: type.body.fontSize, fontFamily: "Cairo_600SemiBold", color: colors.onSurface, textAlign: textStart },
  chevron: { fontSize: type.title.fontSize, color: colors.outline },
});
