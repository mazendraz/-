import { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { colors, type } from "@alassema/core";
import Button from "../components/Button";
import Icon from "../components/Icon";
import TextField from "../components/TextField";
import Logo from "../components/Logo";
import GoogleIcon from "../components/GoogleIcon";
import * as AppleAuthentication from "expo-apple-authentication";
import {
  registerWithPassword,
  resendVerification,
  signInWithApple,
  signInWithPassword,
  useCustomerAuth,
} from "../lib/customerAuth";
import { isGoogleSignInConfigured, useGoogleSignIn } from "../lib/googleAuth";
import { isAppleSignInAvailable, signInWithApple as runAppleSheet } from "../lib/appleAuth";
import { ApiError, rowStart } from "@alassema/mobile-shared";

type Mode = "signin" | "register";

/**
 * Customer sign-in and registration — the mobile counterpart of the
 * website's SignIn.tsx. Same shape deliberately: one screen, two modes,
 * Google above the email form, because splitting them means half of arriving
 * customers land on the wrong one.
 */
export default function SignIn() {
  const { customer } = useCustomerAuth();
  const { next: rawNext, mode: rawMode } = useLocalSearchParams<{ next?: string; mode?: string }>();
  // Guest prompts that offer "إنشاء حساب" (e.g. starting a service request)
  // link here with ?mode=register so that tap lands straight on the
  // registration form instead of sign-in — same screen either way, just a
  // different starting tab.
  const [mode, setMode] = useState<Mode>(rawMode === "register" ? "register" : "signin");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [needsVerify, setNeedsVerify] = useState(false);
  const [resent, setResent] = useState(false);
  const [registered, setRegistered] = useState(false);
  const [mailFailed, setMailFailed] = useState(false);
  // Native check, so it cannot be answered at module scope the way
  // isGoogleSignInConfigured() can. False on Android and on iOS below 13.
  const [appleAvailable, setAppleAvailable] = useState(false);

  // Only ever a path on this site. An absolute URL here would turn sign-in
  // into an open redirect — same guard as the website's SignIn.tsx.
  const next =
    typeof rawNext === "string" && rawNext.startsWith("/") && !rawNext.startsWith("//")
      ? rawNext
      : "/requests";

  // Already signed in (e.g. a fast-refresh landed here) — leave immediately.
  useEffect(() => {
    if (customer) router.replace(next as never);
  }, [customer, next]);

  const { ready: googleReady, promptAsync: promptGoogle } = useGoogleSignIn((idToken) => {
    setBusy(true);
    setError("");
    import("../lib/customerAuth")
      .then(({ signInWithGoogle }) => signInWithGoogle(idToken))
      .then(() => router.replace(next as never))
      .catch((err) => {
        setBusy(false);
        setError(err instanceof ApiError ? err.message : "تعذّر تسجيل الدخول. جرّب تاني.");
      });
  });

  useEffect(() => {
    let alive = true;
    void isAppleSignInAvailable()
      .then((ok) => {
        if (alive) setAppleAvailable(ok);
      })
      // Availability is a rendering decision, not a failure worth surfacing: if
      // the check itself breaks, the right outcome is simply no Apple button.
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  async function onApplePress() {
    // Apple renders its own native button, which has no disabled state — so the
    // re-entrancy guard the other buttons get from `busy` has to be explicit.
    if (busy) return;
    setError("");
    setBusy(true);
    try {
      const payload = await runAppleSheet();
      if (!payload) {
        // The sheet was dismissed. A cancel is an ordinary outcome of a login
        // screen, not something to show a message about.
        setBusy(false);
        return;
      }
      await signInWithApple(payload);
      router.replace(next as never);
    } catch (err) {
      setBusy(false);
      setError(err instanceof ApiError ? err.message : "تعذّر تسجيل الدخول بـ Apple. جرّب تاني.");
    }
  }

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
      router.replace(next as never);
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
      // The server now reports whether the mail actually left; a `false` here
      // used to be indistinguishable from success and produced a "اتبعت"
      // message over an email that was never accepted.
      const sent = await resendVerification(email.trim());
      setMailFailed(!sent);
      setResent(sent);
    } catch {
      setError("تعذّر إرسال اللينك. جرّب تاني.");
    } finally {
      setBusy(false);
    }
  }

  if (registered) {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.card}>
            {/* Status badge — a tinted disc rather than a bare glyph, so the
                outcome reads at a glance before any text is parsed. Tone
                follows the outcome: brand blue for "on its way", warning
                amber for "we couldn't send it". */}
            <View style={[styles.statusBadge, mailFailed && styles.statusBadgeWarn]}>
              <Icon
                name={mailFailed ? "report_problem" : "mark_email_unread"}
                size={34}
                color={mailFailed ? colors.onWarningContainer : colors.primary}
              />
            </View>

            <Text style={styles.heading}>
              {mailFailed ? "متعرفناش نبعت الإيميل" : "بصّ في بريدك"}
            </Text>

            {mailFailed ? (
              <Text style={styles.body}>
                حسابك اتعمل بنجاح، بس إيميل التأكيد ماخرجش. جرّب تبعته تاني — ولو فضل
                يفشل كلّمنا وهنظبطها.
              </Text>
            ) : (
              <>
                <Text style={styles.body}>بعتنا لينك التأكيد على</Text>
                {/* The address gets its own emphasized chip: it is the one
                    thing worth double-checking here (a typo in it is the most
                    common reason the mail "never arrives"). LTR + selectable
                    so it reads correctly and can be copied. */}
                <View style={styles.emailChip}>
                  <Text style={styles.emailChipText} selectable numberOfLines={1}>
                    {email.trim()}
                  </Text>
                </View>
              </>
            )}

            {!mailFailed && (
              <View style={styles.stepsBox}>
                <View style={styles.stepRow}>
                  <Text style={styles.stepNum}>١</Text>
                  <Text style={styles.stepText}>افتح الإيميل واضغط على زرار التأكيد</Text>
                </View>
                <View style={styles.stepRow}>
                  <Text style={styles.stepNum}>٢</Text>
                  <Text style={styles.stepText}>هترجع للتطبيق وحسابك يبقى جاهز</Text>
                </View>
                <Text style={styles.stepsNote}>
                  اللينك صالح ٢٤ ساعة. لو ملقتهوش، بصّ في الـ Spam أو الرسائل المهملة.
                </Text>
              </View>
            )}

            <View style={styles.registeredActions}>
              {resent ? (
                <View style={styles.resentRow}>
                  <Icon name="check_circle" size={18} color={colors.success} />
                  <Text style={styles.resent}>اتبعت تاني. بصّ في بريدك.</Text>
                </View>
              ) : (
                <Button
                  label="ابعت اللينك تاني"
                  variant="secondary"
                  busy={busy}
                  onPress={onResend}
                />
              )}

              {/* A way back. Without this the screen was terminal — the only
                  exits were the OS back gesture or force-quitting the app. */}
              <Text
                style={styles.switchRow}
                onPress={() => {
                  setRegistered(false);
                  setResent(false);
                  setMailFailed(false);
                  setMode("signin");
                }}
              >
                أكّدت بريدك؟ <Text style={styles.switchLink}>سجّل دخولك</Text>
              </Text>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* A way out. This screen is most often PUSHED — a guest taps a locked
          tab, or an action asks them to sign in first — and until now it had
          no back affordance at all, so the only escape was the tab bar it
          was covering. Hidden when there is genuinely nowhere to go back to
          (a cold start that lands here directly), rather than showing an
          arrow that does nothing. */}
      {router.canGoBack() && (
        <View style={styles.backRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="رجوع"
            onPress={() => router.back()}
            hitSlop={12}
          >
            <Icon name="arrow_forward" size={22} color={colors.onSurface} />
          </Pressable>
        </View>
      )}
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.card}>
            <Logo size={56} />
            <Text style={styles.heading}>
              {mode === "signin" ? "تسجيل الدخول" : "اعمل حسابك"}
            </Text>
            <Text style={styles.body}>عشان تتابع طلباتك وتتكلم مع الشركات</Text>

            {error !== "" && (
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

            {(appleAvailable || isGoogleSignInConfigured()) && (
              <>
                {/*
                  Apple first, and rendered with Apple own component rather than
                  the app Button. Both are review requirements, not taste:
                  guideline 4.8 says the Sign in with Apple option must be
                  offered at least as prominently as any other, and the App Store
                  guidelines require this proprietary button rather than a custom
                  one. cornerRadius matches Button styles.base so the two line up.
                */}
                {appleAvailable && (
                  <AppleAuthentication.AppleAuthenticationButton
                    buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
                    buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                    cornerRadius={12}
                    style={styles.appleButton}
                    onPress={onApplePress}
                  />
                )}
                {isGoogleSignInConfigured() && (
                  <Button
                    label="المتابعة باستخدام Google"
                    variant="google"
                    icon={<GoogleIcon size={20} />}
                    onPress={onGooglePress}
                    busy={busy}
                    disabled={!googleReady}
                  />
                )}
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
              hint={mode === "register" ? "8 حروف على الأقل. متستخدمش حاجة من إيميلك." : undefined}
            />

            {mode === "signin" && (
              <Text style={styles.forgotLink} onPress={() => router.push("/forgot-password")}>
                نسيت كلمة المرور؟
              </Text>
            )}

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
  // `rowStart` puts the arrow on the reading-start edge — the right, in
  // Arabic — which is where a back control belongs in an RTL UI.
  backRow: { flexDirection: rowStart, paddingHorizontal: 16, paddingTop: 4 },
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
  // ── "Check your inbox" screen ─────────────────────────────────────────────
  statusBadge: {
    alignSelf: "center",
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: `${colors.primary}14`,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  statusBadgeWarn: { backgroundColor: colors.warningContainer },
  emailChip: {
    alignSelf: "center",
    backgroundColor: colors.surfaceContainer,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
    maxWidth: "100%",
    marginTop: -6,
  },
  emailChipText: {
    fontSize: type.label.fontSize,
    fontFamily: "Cairo_700Bold",
    color: colors.onSurface,
    writingDirection: "ltr",
    textAlign: "center",
  },
  stepsBox: {
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: 16,
    padding: 14,
    gap: 10,
    marginTop: 2,
  },
  stepRow: { flexDirection: rowStart, alignItems: "center", gap: 10 },
  stepNum: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primary,
    color: colors.onPrimary,
    fontFamily: "Cairo_700Bold",
    fontSize: type.caption.fontSize,
    textAlign: "center",
    lineHeight: 24,
  },
  stepText: {
    flex: 1,
    fontSize: type.label.fontSize,
    fontFamily: "Cairo_400Regular",
    color: colors.onSurfaceVariant,
    textAlign: "right",
  },
  stepsNote: {
    fontSize: type.caption.fontSize,
    fontFamily: "Cairo_400Regular",
    color: colors.outline,
    textAlign: "right",
    lineHeight: 18,
  },
  registeredActions: { gap: 12, marginTop: 2 },
  resentRow: { flexDirection: rowStart, alignItems: "center", justifyContent: "center", gap: 6 },
  forgotLink: {
    fontSize: type.caption.fontSize,
    fontFamily: "Cairo_600SemiBold",
    color: colors.primary,
    textAlign: "left",
    marginTop: -6,
  },
  // Apple button draws itself entirely from these two values — it ignores
  // backgroundColor and borderRadius by design, and renders nothing at all
  // without an explicit height and width.
  appleButton: { height: 48, width: "100%" },
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
