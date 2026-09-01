import { StyleSheet, Text, View } from "react-native";
import { colors, type } from "@alassema/core";
import { useStaffAuth } from "../lib/staffAuth";
import { hasDesktopPermission, type DesktopPermission } from "../lib/permissions";

/**
 * Route-level guard for every control/* screen — checked here, not just in
 * nav visibility, since a deep link or a stale bookmark can reach a route
 * directly regardless of what the hub screen shows. The server is still the
 * real authority (desktopOnly() 403s regardless); this is UI-only, same
 * disclaimer as lib/permissions.ts's own header comment.
 */
export default function PermissionGate({
  permission,
  children,
}: {
  permission: DesktopPermission | readonly DesktopPermission[];
  children: React.ReactNode;
}) {
  const { user } = useStaffAuth();
  if (!hasDesktopPermission(user, permission)) {
    return (
      <View style={styles.wrap}>
        <Text style={styles.title}>مفيش صلاحية</Text>
        <Text style={styles.message}>حسابك مش معاه صلاحية الوصول للقسم ده. اطلب من أدمن يضيفها من شاشة الفريق.</Text>
      </View>
    );
  }
  return <>{children}</>;
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 8 },
  title: { fontSize: type.title.fontSize, fontFamily: "Alexandria_700Bold", color: colors.onSurface, textAlign: "center" },
  message: { fontSize: type.body.fontSize, fontFamily: "Cairo_400Regular", color: colors.onSurfaceVariant, textAlign: "center", lineHeight: 20 },
});
