import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Redirect } from "expo-router";
import { colors, type } from "@alassema/core";
import { ApiError } from "@alassema/mobile-shared";
import Button from "../components/Button";
import TextField from "../components/TextField";
import Logo from "../components/Logo";
import { signIn, useStaffAuth } from "../lib/staffAuth";
import { isAdmin } from "../lib/permissions";

/**
 * Staff sign-in — the only entry point into this app. No social sign-in, no
 * registration: accounts are provisioned by an admin (see phase-11's team
 * screen), matching the web dashboard's own model.
 *
 * No `next` param (compare mobile/client's sign-in.tsx, which supports
 * returning to whatever screen prompted a guest to sign in) — this app has
 * no guest mode, so there is only ever one destination on success: the
 * signed-in role's own tab group, same as app/index.tsx's own redirect.
 */
export default function SignIn() {
  const { user } = useStaffAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Already signed in (e.g. a fast-refresh landed here, or a stale deep link
  // to /sign-in) — leave immediately rather than showing a form that would
  // just fail with "already signed in" on submit.
  if (user) {
    return <Redirect href={isAdmin(user) ? "/(admin)/overview" : "/(provider)/overview"} />;
  }

  const canSubmit = email.trim().length > 0 && password.length > 0 && !busy;

  async function handleSubmit() {
    if (!canSubmit) return;
    setBusy(true);
    setError("");
    try {
      await signIn(email.trim(), password);
      // No navigation call needed: signIn() sets useStaffAuth().user, which
      // makes the redirect above fire on the next render.
    } catch (err) {
      // The server already formats both the "wrong password" (401) and rate-
      // limit (429) messages as complete sentences — see api's auth/login/
      // route.ts. Shown as-is, matching mobile/client's sign-in.tsx
      // precedent; only the truly-unknown case gets local Arabic copy.
      setError(err instanceof ApiError ? err.message : "تعذّر تسجيل الدخول. جرّب تاني.");
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <Logo size={56} />
          <Text style={styles.subtitle}>تطبيق الموظفين</Text>

          <View style={styles.form}>
            <TextField
              label="البريد الإلكتروني"
              value={email}
              onChangeText={(v) => {
                setEmail(v);
                setError("");
              }}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="emailAddress"
              editable={!busy}
              style={styles.field}
            />
            <TextField
              label="كلمة المرور"
              value={password}
              onChangeText={(v) => {
                setPassword(v);
                setError("");
              }}
              secureTextEntry
              textContentType="password"
              editable={!busy}
              style={styles.field}
              onSubmitEditing={handleSubmit}
            />

            {error ? <Text style={styles.errorBanner}>{error}</Text> : null}

            <Button
              label="دخول"
              onPress={handleSubmit}
              busy={busy}
              disabled={!canSubmit}
              style={styles.submit}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: { flexGrow: 1, justifyContent: "center", padding: 24 },
  subtitle: {
    fontSize: type.subhead.fontSize,
    fontFamily: "Cairo_500Medium",
    color: colors.onSurfaceVariant,
    textAlign: "center",
    marginTop: 12,
    marginBottom: 36,
  },
  form: { gap: 16 },
  field: {},
  errorBanner: {
    fontSize: type.body.fontSize,
    fontFamily: "Cairo_500Medium",
    color: colors.error,
    textAlign: "center",
  },
  submit: { marginTop: 4 },
});
