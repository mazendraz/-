import { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { colors, type } from "@alassema/core";
import Button from "../components/Button";
import TextField from "../components/TextField";
import {
  registerWithPassword,
  resendVerification,
  signInWithPassword,
  useCustomerAuth,
} from "../lib/customerAuth";
import { isGoogleSignInConfigured, useGoogleSignIn } from "../lib/googleAuth";
import { ApiError } from "../lib/api";

type Mode = "signin" | "register";

/**
 * Customer sign-in and registration — the mobile counterpart of the
 * website's SignIn.tsx. Same shape deliberately: one screen, two modes,
 * Google above the email form, because splitting them means half of arriving
 * customers land on the wrong one.
 */
export default function SignIn() {
  const { customer } = useCustomerAuth();
  const [mode, setMode] = useState<Mode>("signin");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [needsVerify, setNeedsVerify] = useState(false);
  const [resent, setResent] = useState(false);
  const [registered, setRegistered] = useState(false);
  const [mailFailed, setMailFailed] = useState(false);

  // Already signed in (e.g. a fast-refresh landed here) — leave immediately.
  useEffect(() => {
    if (customer) router.replace("/requests");
  }, [customer]);

  const { ready: googleReady, promptAsync: promptGoogle } = useGoogleSignIn((idToken) => {
    setBusy(true);
    setError("");
    import("../lib/customerAuth")
      .then(({ signInWithGoogle }) => signInWithGoogle(idToken))
      .then(() => router.replace("/requests"))
      .catch((err) => {
        setBusy(false);
        setError(err instanceof ApiError ? err.message : "تعذّر تسجيل الدخول. جرّب تاني.");
      });
  });

  async function onGooglePress() {
    setError("");
    try {
      await promptGoogle();
    } catch {
      setError("زرار جوجل مقدرش يفتح. جرّب تاني.");
    }
  }

  async function onSubmit() {
    setError("");
    setNeedsVerify(false);
    setBusy(true);
    try {
      if (mode === "register") {
        const { verificationSent } = await registerWithPassword({
          name: name.trim(),
          email: email.trim(),
          password,
        });
        setMailFailed(!verificationSent);
        setRegistered(true);
        return;
      }
      await signInWithPassword(email.trim(), password);
      router.replace("/requests");
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401 && /confirm your email/i.test(err.message)) {
          setNeedsVerify(true);
        } else {
          setError(
            err.status === 409 || err.status === 400 || err.status === 429
              ? err.message
              : "تعذّر تسجيل الدخول. جرّب تاني.",
          );
        }
      } else {
        setError("تعذّر تسجيل الدخول. جرّب تاني.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function onResend() {
    setBusy(true);
    try {
      await resendVerification(email.trim());
      setResent(true);
    } catch {
      setError("تعذّر إرسال اللينك. جرّب تاني.");
    } finally {
      setBusy(false);
    }
  }

  if (registered) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.card}>
          <Text style={styles.heading}>
            {mailFailed ? "متعرفناش نبعت الإيميل" : "بصّ في بريدك"}
          </Text>
          <Text style={styles.body}>
            {mailFailed
              ? "حسابك اتعمل، بس إيميل التأكيد ماخرجش. جرّب تبعته تاني — ولو فضل يفشل كلّمنا وهنظبطها."
              : `بعتنا لينك تأكيد على ${email.trim()}`}
          </Text>
          {resent ? (
            <Text style={styles.resent}>اتبعت. بصّ في بريدك.</Text>
          ) : (
            <Button label="ابعت اللينك تاني" variant="secondary" busy={busy} onPress={onResend} />
          )}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.card}>
            <Text style={styles.brand}>العاصمة</Text>
            <Text style={styles.heading}>
              {mode === "signin" ? "تسجيل الدخول" : "اعمل حسابك"}
            </Text>
            <Text style={styles.body}>عشان تتابع طلباتك وتتكلم مع الشركات</Text>

            {error && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {needsVerify && (
              <View style={styles.warnBox}>
                <Text style={styles.warnText}>أكّد بريدك الإلكتروني الأول — اللينك في بريدك.</Text>
                {resent ? (
                  <Text style={styles.resent}>اتبعت. بصّ في بريدك.</Text>
                ) : (
                  <Button label="ابعت اللينك تاني" variant="secondary" busy={busy} onPress={onResend} />
                )}
              </View>
            )}

            {isGoogleSignInConfigured() && (
              <>
                <Button
                  label="المتابعة باستخدام جوجل"
                  onPress={onGooglePress}
                  busy={busy}
                  disabled={!googleReady}
                />
                <View style={styles.dividerRow}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerLabel}>أو</Text>
                  <View style={styles.dividerLine} />
                </View>
              </>
            )}

            {mode === "register" && (
              <TextField label="اسمك" value={name} onChangeText={setName} />
            )}
            <TextField
              label="البريد الإلكتروني"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoComplete="email"
              ltr
            />
            <TextField
              label="كلمة المرور"
              value={password}
              onChangeText={setPassword}
              secure
              autoComplete={mode === "register" ? "password-new" : "password"}
              ltr
              hint={mode === "register" ? "12 حرف على الأقل. ابعد عن أي حاجة سهل تتخمّن." : undefined}
            />

            <Button
              label={mode === "signin" ? "دخول" : "إنشاء حساب"}
              onPress={onSubmit}
              busy={busy}
            />

            <Text style={styles.switchRow}>
              {mode === "signin" ? "أول مرة هنا؟ " : "عندك حساب بالفعل؟ "}
              <Text
                style={styles.switchLink}
                onPress={() => setMode(mode === "signin" ? "register" : "signin")}
              >
                {mode === "signin" ? "إنشاء حساب" : "دخول"}
              </Text>
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
  brand: {
    fontSize: type.title.fontSize,
    fontFamily: "Alexandria_800ExtraBold",
    color: colors.primary,
    textAlign: "center",
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
  warnBox: {
    backgroundColor: colors.warningContainer,
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  warnText: {
    fontSize: type.label.fontSize,
    fontFamily: "Cairo_500Medium",
    color: colors.onWarningContainer,
    textAlign: "right",
  },
  resent: {
    fontSize: type.label.fontSize,
    fontFamily: "Cairo_700Bold",
    color: colors.success,
    textAlign: "center",
  },
  dividerRow: { flexDirection: "row", alignItems: "center", gap: 10, marginVertical: 2 },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.outlineVariant },
  dividerLabel: { fontSize: type.caption.fontSize, color: colors.outline, fontFamily: "Cairo_400Regular" },
  switchRow: {
    fontSize: type.label.fontSize,
    fontFamily: "Cairo_400Regular",
    color: colors.outline,
    textAlign: "center",
    marginTop: 4,
  },
  switchLink: {
    fontFamily: "Cairo_700Bold",
    color: colors.primary,
  },
});
