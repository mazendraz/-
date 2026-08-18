import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { colors, type } from "@alassema/core";
import Icon from "../components/Icon";
import Logo from "../components/Logo";
import Button from "../components/Button";
import { verifyEmailToken } from "../lib/customerAuth";

/**
 * Landing screen for the emailed confirmation link — the mobile counterpart
 * of the website's VerifyEmail.tsx (/verify-email?token=…). Verifying signs
 * the customer in, so success goes straight to their requests rather than
 * asking for the password they set a minute ago — the link came out of the
 * inbox they're proving they control, which is the same evidence.
 *
 * Reachable today only via the custom `alassema://verify-email?token=…`
 * scheme (or a manual deep link while testing) — the email itself links to
 * the plain web URL (see api's sendCustomerVerificationEmail), and this app
 * has no Universal Link / App Link association with that domain yet. See the
 * phase-7 ship notes for the open question on adding one.
 */
export default function VerifyEmail() {
  const { token: rawToken } = useLocalSearchParams<{ token?: string }>();
  const token = typeof rawToken === "string" ? rawToken : "";
  const [state, setState] = useState<"working" | "failed">("working");
  // Verification burns the token server-side — a Fast Refresh re-running this
  // effect must not consume nothing and report failure over a success that
  // already happened.
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;

    if (!token) {
      setState("failed");
      return;
    }

    verifyEmailToken(token)
      .then(() => router.replace("/requests"))
      .catch(() => setState("failed"));
  }, [token]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.card}>
        <Logo size={56} />

        {state === "working" ? (
          <>
            <ActivityIndicator size="large" color={colors.primary} style={styles.spinner} />
            <Text style={styles.body}>بنأكّد بريدك…</Text>
          </>
        ) : (
          <>
            <View style={styles.errorIcon}>
              <Icon name="link_off" size={28} color={colors.onErrorContainer} />
            </View>
            <Text style={styles.heading}>اللينك ده مابقاش شغّال</Text>
            <Text style={styles.body}>
              لينكات التأكيد بتنتهي بعد 24 ساعة وبتستخدم مرة واحدة بس. سجّل دخولك عشان تاخد واحد جديد.
            </Text>
            <Button
              label="روح لتسجيل الدخول"
              onPress={() => router.replace("/sign-in")}
              style={styles.signInBtn}
            />
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceContainer, alignItems: "center", justifyContent: "center", padding: 20 },
  card: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: 24,
    padding: 24,
    alignItems: "center",
    gap: 12,
  },
  spinner: { marginTop: 8 },
  errorIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: colors.errorContainer,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  heading: {
    fontSize: type.title.fontSize,
    fontFamily: "Alexandria_700Bold",
    color: colors.onSurface,
    textAlign: "center",
  },
  body: {
    fontSize: type.label.fontSize,
    fontFamily: "Cairo_400Regular",
    color: colors.outline,
    textAlign: "center",
    lineHeight: 20,
  },
  signInBtn: { alignSelf: "stretch", marginTop: 8 },
});
