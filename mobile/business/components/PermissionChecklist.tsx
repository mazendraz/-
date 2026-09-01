import { Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { colors, type } from "@alassema/core";
import { textStart } from "@alassema/mobile-shared";
import { DESKTOP_PERMISSIONS, type DesktopPermission } from "../lib/permissions";

/** What each grant actually unlocks in the desktop Business Control Center
 *  — shown instead of the bare slug, per phase-11's own instruction (these
 *  unlock financial data, so "what it means" matters more than usual). */
const PERMISSION_LABEL: Record<DesktopPermission, { label: string; description: string }> = {
  "overview:read": { label: "نظرة عامة", description: "لوحة المؤشرات العامة للمنصة." },
  "operations:read": { label: "العمليات", description: "الطلبات وسير العمل عبر كل الشركات." },
  "business:read": { label: "الأعمال", description: "بيانات العملاء ومقدّمي الخدمة." },
  "finance:read": { label: "المالية (قراءة)", description: "العمولات والمعاملات المالية." },
  "finance:write": { label: "المالية (تعديل)", description: "تسجيل وتعديل المعاملات المالية." },
  "analytics:read": { label: "تحليلات الأسعار", description: "تقارير أسعار السوق والمقارنات." },
  "reports:read": { label: "التقارير", description: "تصدير التقارير التفصيلية." },
  "settings:write": { label: "إعدادات النظام", description: "تعديل إعدادات لوحة التحكم المكتبية." },
};

export default function PermissionChecklist({
  value,
  onChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
}) {
  function toggle(permission: DesktopPermission) {
    onChange(value.includes(permission) ? value.filter((p) => p !== permission) : [...value, permission]);
  }

  return (
    <View style={styles.wrap}>
      {DESKTOP_PERMISSIONS.map((permission) => {
        const info = PERMISSION_LABEL[permission];
        const checked = value.includes(permission);
        return (
          <Pressable key={permission} style={styles.row} onPress={() => toggle(permission)}>
            <View style={styles.info}>
              <Text style={styles.label}>{info.label}</Text>
              <Text style={styles.description}>{info.description}</Text>
            </View>
            <Switch value={checked} onValueChange={() => toggle(permission)} />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  row: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surfaceContainer,
    borderRadius: 12,
    padding: 12,
    gap: 10,
  },
  info: { flex: 1, gap: 2 },
  label: { fontSize: type.body.fontSize, fontFamily: "Cairo_700Bold", color: colors.onSurface, textAlign: textStart },
  description: { fontSize: type.caption.fontSize, fontFamily: "Cairo_400Regular", color: colors.onSurfaceVariant, textAlign: textStart },
});
