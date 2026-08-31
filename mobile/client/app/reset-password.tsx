import { useEffect, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { colors, type } from "@alassema/core";
import Icon from "../components/Icon";
import Button from "../components/Button";
import TextField from "../components/TextField";
import Logo from "../components/Logo";
import { resetPassword } from "../lib/customerAuth";
import { ApiError } from "@alassema/mobile-shared";

/**
 * Landing screen for the emailed password-reset link — the mobile counterpart
 * of verify-email.tsx, one step longer: that link needs nothing but its
 * token; this one still needs the NEW password before it can call the API,
 * so there's a real form here rather than a pure redirect-on-mount.
 *
 * Reachable today only via the custom `alassema://reset-password?token=…`
 * scheme — same limitation verify-email.tsx documents (no Universal Link
 * association with the website's plain URL yet).
 */
export default function ResetPassword() {
  const { token: rawToken } = useLocalSearchParams<{ token?: string }>();
  const token = typeof rawToken === "string" ? rawToken : "";

  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Distinct from a submit failure: a MISSING token means the link itself is
  // broken (opened with no token at all, not merely expired) — same terminal
  // state verify-email.tsx shows, just reached without ever attempting a call.
  const [linkInvalid, setLinkInvalid] = useState(false);

  useEffect(() => {
    if (!token) setLinkInvalid(true);
  }, [token]);

  async function onSubmit() {
    if (!token || password.length < 8 || busy) return;
    setBusy(true);
    setError("");
    try {
      await resetPassword(token, password);
      router.replace("/requests");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        // The token itself was rejected (expired, already used, or malformed)
        // — same terminal state as a missing token, not a retry-in-place error.
        setLinkInvalid(true);
      } else {
        setError(err instanceof ApiError ? err.message : "تعذّر تغيير كلمة المرور. جرّب تاني.");
      }
    } finally {
      setBusy(false);
    }
  }

  if (linkInvalid) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.card}>
          <Logo size={56} />
          <View style={styles.errorIcon}>
            <Icon name="link_off" size={28} color={colors.onErrorContainer} />
          </View>
          <Text style={styles.heading}>اللينك ده مابقاش شغّال</Text>
          <Text style={styles.body}>
            لينكات تغيير كلمة المرور بتنتهي بعد ساعة وبتستخدم مرة واحدة بس. اطلب لينك جديد.
          </Text>
          <Button label="اطلب لينك جديد" onPress={() => router.replace("/forgot-password")} />
        </View>
      </SafeAreaView>
    );
  }

  // A blank frame for the one render before the token-presence effect above
  // has run — shorter than the eye can register, and avoids flashing the form
  // for a token that's about to turn out missing.
  if (!token) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.card}>
            <Logo size={56} />
            <Text style={styles.heading}>كلمة مرور جديدة</Text>
            <Text style={styles.body}>اختار كلمة مرور جديدة لحسابك.</Text>

            {error !== "" && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            <TextField
              label="كلمة المرور الجديدة"
              value={password}
              onChangeText={setPassword}
              secure
              autoComplete="password-new"
              ltr
              hint="8 حروف على الأقل. متستخدمش حاجة من إيميلك."
            />

            <Button label="غيّر كلمة المرور" onPress={onSubmit} busy={busy} disabled={password.length < 8} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceContainer, alignItems: "center", justifyContent: "center" },
  flex: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: "center", padding: 20 },
  card: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: 24,
    padding: 24,
    gap: 14,
  },
  heading: {
    fontSize: type.headline.fontSize,
    fontFamily: "Alexandria_700Bold",
    color: colors.onSurface,
    textAlign: "center",
    marginTop: 4,
  },
  body: {
    fontSize: type.body.fontSize,
    fontFamily: "Cairo_400Regular",
    color: colors.outline,
    textAlign: "center",
    marginBottom: 4,
  },
  errorBox: {
    backgroundColor: colors.errorContainer,
    borderRadius: 12,
    padding: 12,
  },
  errorText: {
    fontSize: type.label.fontSize,
    fontFamily: "Cairo_500Medium",
    color: colors.onErrorContainer,
    textAlign: "right",
  },
  errorIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: colors.errorContainer,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginTop: 4,
  },
});
