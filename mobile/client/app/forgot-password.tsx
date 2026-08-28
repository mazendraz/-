import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { colors, type } from "@alassema/core";
import Button from "../components/Button";
import TextField from "../components/TextField";
import Logo from "../components/Logo";
import { requestPasswordReset } from "../lib/customerAuth";

/**
 * "Forgot your password?" — the entry point sign-in.tsx links to. One field,
 * one action: always ends in the same "check your inbox" state regardless of
 * whether the address has an account, matches api's requestPasswordReset,
 * which never reveals that either. Completing the flow (setting the new
 * password) happens in reset-password.tsx, reached from the emailed link —
 * this screen only ever asks for the address and sends the email.
 */
export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit() {
    if (!email.trim()) return;
    setBusy(true);
    try {
      await requestPasswordReset(email.trim());
    } catch {
      // Deliberately swallowed: the endpoint itself never reveals whether the
      // address exists, and a network hiccup here shouldn't either — the
      // success state is honest either way ("if an account exists, an email
      // is on its way"), and retrying costs nothing.
    } finally {
      setBusy(false);
      setSent(true);
    }
  }

  if (sent) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.card}>
          <Logo size={56} />
          <Text style={styles.heading}>بصّ في بريدك</Text>
          <Text style={styles.body}>
            لو الإيميل ده مرتبط بحساب، هيوصلّك لينك لتغيير كلمة المرور خلال دقايق.
          </Text>
          <Button label="الرجوع لتسجيل الدخول" variant="secondary" onPress={() => router.replace("/sign-in")} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.card}>
            <Logo size={56} />
            <Text style={styles.heading}>نسيت كلمة المرور؟</Text>
            <Text style={styles.body}>اكتب إيميلك وهنبعتلك لينك تقدر تغيّرها بيه.</Text>

            <TextField
              label="البريد الإلكتروني"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoComplete="email"
              ltr
            />

            <Button label="ابعت اللينك" onPress={onSubmit} busy={busy} disabled={!email.trim()} />

            <Text style={styles.switchRow} onPress={() => router.replace("/sign-in")}>
              الرجوع لتسجيل الدخول
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceContainer },
  flex: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: "center", padding: 20 },
  card: {
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
  switchRow: {
    fontSize: type.label.fontSize,
    fontFamily: "Cairo_700Bold",
    color: colors.primary,
    textAlign: "center",
    marginTop: 4,
  },
});
