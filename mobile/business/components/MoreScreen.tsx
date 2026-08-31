import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, type } from "@alassema/core";
import Button from "./Button";
import { signOut, useStaffAuth } from "../lib/staffAuth";

/**
 * Account + sign-out — the one real, non-placeholder screen phase 2 ships
 * beyond the shell itself. Phases 6 (provider ops) and 11 (admin platform)
 * turn this into a real menu (waitlist/availability/profile for a provider;
 * team/settings/maintenance for an admin) — this is the seed both grow from,
 * not a screen either phase replaces wholesale.
 */
export default function MoreScreen() {
  const { user } = useStaffAuth();
  const [signingOut, setSigningOut] = useState(false);

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
  container: { flex: 1, padding: 20, gap: 24 },
  card: {
    backgroundColor: colors.surfaceContainer,
    borderRadius: 16,
    padding: 20,
    gap: 4,
  },
  name: { fontSize: type.title.fontSize, fontFamily: "Alexandria_700Bold", color: colors.onSurface },
  email: { fontSize: type.body.fontSize, fontFamily: "Cairo_400Regular", color: colors.onSurfaceVariant },
  role: { fontSize: type.label.fontSize, fontFamily: "Cairo_600SemiBold", color: colors.primary, marginTop: 4 },
  signOut: { marginTop: "auto" },
});
