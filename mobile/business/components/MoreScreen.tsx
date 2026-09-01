import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { colors, type } from "@alassema/core";
import { textStart } from "@alassema/mobile-shared";
import Button from "./Button";
import { signOut, useStaffAuth } from "../lib/staffAuth";
import { isProvider } from "../lib/permissions";

interface MenuItem {
  label: string;
  href: string;
}

/**
 * Account + sign-out, plus a role-branched menu. Provider items land in
 * phase 6; admin's global search lands in phase 8, categories/platform
 * waitlist in phase 10 (companies themselves have their own tab —
 * (admin)/companies.tsx), team/settings/maintenance in phase 11 — this
 * screen is the shared shell every phase grows into, not a screen any one
 * phase replaces wholesale.
 */
export default function MoreScreen() {
  const { user } = useStaffAuth();
  const [signingOut, setSigningOut] = useState(false);

  const menu: MenuItem[] = isProvider(user)
    ? [
        { label: "قائمة الانتظار", href: "/waitlist" },
        { label: "التوفر وفترات الانشغال", href: "/availability" },
        { label: "معرض الأعمال", href: "/projects" },
        { label: "قائمة الأسعار", href: "/offerings" },
        { label: "خصومات الباقات", href: "/bundle-rules" },
        { label: "بيانات الشركة", href: "/profile" },
      ]
    : [
        { label: "بحث شامل", href: "/search" },
        { label: "التصنيفات", href: "/categories" },
        { label: "قائمة الانتظار (كل الشركات)", href: "/platform-waitlist" },
      ];

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await signOut();
      // No navigation call needed: signOut() clears useStaffAuth().user,
      // which makes app/index.tsx's <Redirect> to /sign-in fire on the
      // Stack's next render — same mechanism sign-in.tsx's success path uses
      // in reverse.
    } catch {
      // signOut() already clears local state on a best-effort basis even if
      // the server call fails (see its own comment) — nothing left to do
      // here but stop showing the spinner.
      setSigningOut(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.name}>{user?.name}</Text>
        <Text style={styles.email}>{user?.email}</Text>
        <Text style={styles.role}>{user?.role === "ADMIN" ? "أدمن" : "مقدّم خدمة"}</Text>
      </View>

      {menu.length > 0 ? (
        <View style={styles.menu}>
          {menu.map((item) => (
            <Pressable key={item.href} style={styles.menuItem} onPress={() => router.push(item.href as never)}>
              <Text style={styles.menuLabel}>{item.label}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <Button
        label="تسجيل الخروج"
        variant="danger"
        onPress={handleSignOut}
        busy={signingOut}
        style={styles.signOut}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, gap: 20 },
  card: {
    backgroundColor: colors.surfaceContainer,
    borderRadius: 16,
    padding: 20,
    gap: 4,
  },
  name: { fontSize: type.title.fontSize, fontFamily: "Alexandria_700Bold", color: colors.onSurface },
  email: { fontSize: type.body.fontSize, fontFamily: "Cairo_400Regular", color: colors.onSurfaceVariant },
  role: { fontSize: type.label.fontSize, fontFamily: "Cairo_600SemiBold", color: colors.primary, marginTop: 4 },
  menu: {
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: 14,
    overflow: "hidden",
  },
  menuItem: {
    paddingVertical: 15,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.outlineVariant,
  },
  menuLabel: {
    fontSize: type.body.fontSize,
    fontFamily: "Cairo_600SemiBold",
    color: colors.onSurface,
    textAlign: textStart,
  },
  signOut: { marginTop: "auto" },
});
