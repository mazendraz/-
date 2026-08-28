import { Modal, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { colors, type } from "@alassema/core";
import Button from "./Button";
import { closeGuestPrompt, useGuestPrompt } from "../lib/authGate";

/**
 * The contextual "you need an account for this" prompt — mounted once at the
 * root (app/_layout.tsx) and driven entirely by lib/authGate.ts's
 * `requireAccount`. Same visual language as the app's other modals
 * (FeedbackModal, ReviewModal): centered card over a dim backdrop, not a new
 * pattern.
 *
 * Deliberately separate from the sign-in SCREEN: this is the thing that
 * explains WHY before a guest ever leaves the page they were on, so browsing
 * never feels interrupted by a hard navigation they didn't ask for.
 */
export default function GuestPromptModal() {
  const prompt = useGuestPrompt();
  if (!prompt) return null;

  function goToSignIn(mode?: "register") {
    const next = prompt!.next;
    closeGuestPrompt();
    router.push({ pathname: "/sign-in", params: mode ? { next, mode } : { next } });
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={closeGuestPrompt}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{prompt.title}</Text>
          <Text style={styles.subtitle}>{prompt.subtitle}</Text>

          <View style={styles.actions}>
            <Button label="تسجيل الدخول" onPress={() => goToSignIn()} />
            {prompt.secondary?.kind === "register" && (
              <Button label={prompt.secondary.label} variant="secondary" onPress={() => goToSignIn("register")} />
            )}
          </View>

          {(!prompt.secondary || prompt.secondary.kind === "dismiss") && (
            <Text style={styles.dismiss} onPress={closeGuestPrompt}>
              {prompt.secondary?.label ?? "ليس الآن"}
            </Text>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: 20 },
  card: { backgroundColor: colors.surfaceContainerLowest, borderRadius: 20, padding: 22, gap: 8 },
  title: { fontSize: type.subhead.fontSize, fontFamily: "Cairo_700Bold", color: colors.onSurface, textAlign: "center" },
  subtitle: {
    fontSize: type.label.fontSize,
    fontFamily: "Cairo_400Regular",
    color: colors.outline,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 8,
  },
  actions: { gap: 10 },
  dismiss: {
    fontFamily: "Cairo_700Bold",
    fontSize: type.label.fontSize,
    color: colors.outline,
    textAlign: "center",
    marginTop: 12,
  },
});
