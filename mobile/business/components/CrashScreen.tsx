/**
 * Last-resort screen for when React itself has thrown — a deliberate,
 * verbatim duplicate of mobile/client's own CrashScreen.tsx, not an
 * extraction miss. Its whole design principle (see below) is surviving even
 * if shared infrastructure is what broke — putting it in
 * @alassema/mobile-shared would be exactly backwards for a file whose job is
 * "still render when nothing else can be trusted to."
 *
 * Rendered by the `ErrorBoundary` exported from app/_layout.tsx (expo-router's
 * own convention: https://docs.expo.dev/router/error-boundaries — exporting
 * `ErrorBoundary` from the root layout catches errors thrown anywhere in the
 * route tree below it).
 *
 * ── This file has ZERO project dependencies, deliberately ──────────────────
 * Same reasoning as the website's version: if the thing that crashed was
 * settings, the session bootstrap, or a context provider, anything this
 * screen touches could throw for the same reason — and a crash screen that
 * itself crashes is a blank white screen with no way back. So:
 *   • no @alassema/core (colors/type tokens) — literal hex/sizes instead
 *   • no Icon/Logo components
 *   • no i18n — Arabic only, hardcoded (this app has no i18n system at all,
 *     unlike the website, so there's no toggle to bypass here)
 *   • no hooks beyond what RN's core View/Text/Pressable need
 */
import { Pressable, StyleSheet, Text, View } from "react-native";

/**
 * How many times "حاول تاني" is offered before the screen admits it isn't
 * working.
 *
 * expo-router's `retry` re-renders the route tree in place — it does not reload
 * the app or clear anything. That recovers a genuinely transient throw and does
 * nothing at all for a deterministic one (a malformed response still cached, a
 * bad params value in the URL): the same render runs, the same error is thrown,
 * and the same screen comes back. Offering the button forever invites the user
 * to tap it forever, which is the mobile shape of a retry loop — and unlike the
 * website there is no reload button and no URL bar to escape with.
 */
const MAX_RETRIES = 2;

/**
 * Attempts are counted at MODULE scope, not in component state.
 *
 * Retrying takes the tree fallback → children → (throw) → fallback, and React
 * unmounts the fallback subtree in the middle of that. So a `useState` counter
 * resets to zero on the very re-render it is meant to be counting, and the guard
 * never engages. Module state outlives the remount; a force-quit clears it,
 * which is exactly what the exhausted copy asks the user to do.
 */
let attempts = 0;
let lastAttemptAt = 0;

/**
 * Attempts more than this far apart are unrelated events, not a loop. Without
 * the window, one bad crash early in a session would silently deny the retry
 * button to every unrelated crash after it, for the life of the process.
 */
const RETRY_WINDOW_MS = 30_000;

export default function CrashScreen({ error, retry }: { error?: Error; retry?: () => void }) {
  const detail = error ? `${error.name}: ${error.message}` : "";
  const withinWindow = Date.now() - lastAttemptAt <= RETRY_WINDOW_MS;
  const exhausted = withinWindow && attempts >= MAX_RETRIES;

  function onRetry() {
    attempts = Date.now() - lastAttemptAt > RETRY_WINDOW_MS ? 1 : attempts + 1;
    lastAttemptAt = Date.now();
    retry?.();
  }

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <View style={styles.iconCircle}>
          <Text style={styles.iconText}>⚠️</Text>
        </View>
        <Text style={styles.title}>حصل خطأ غير متوقع</Text>
        <Text style={styles.body}>
          {exhausted
            ? "المشكلة مستمرة. اقفل التطبيق وافتحه تاني."
            : "التطبيق واجه مشكلة. جرّب تاني."}
        </Text>

        {retry && !exhausted && (
          <Pressable accessibilityRole="button" style={styles.retryBtn} onPress={onRetry}>
            <Text style={styles.retryText}>حاول تاني</Text>
          </Pressable>
        )}

        {__DEV__ && detail ? <Text style={styles.detail}>{detail}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#faf8f5", alignItems: "center", justifyContent: "center", padding: 24 },
  card: { width: "100%", maxWidth: 380, alignItems: "center" },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#fdecea",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  iconText: { fontSize: 34 },
  title: { fontSize: 22, fontWeight: "800", color: "#1c1b1a", textAlign: "center", marginBottom: 10 },
  body: { fontSize: 15, lineHeight: 24, color: "#4a4644", textAlign: "center", marginBottom: 24 },
  retryBtn: {
    backgroundColor: "#8a6a4f",
    borderRadius: 12,
    paddingHorizontal: 22,
    paddingVertical: 12,
  },
  retryText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  detail: {
    marginTop: 20,
    fontSize: 12,
    lineHeight: 18,
    color: "#3a3634",
    backgroundColor: "#f0ebe5",
    borderRadius: 10,
    padding: 12,
    width: "100%",
  },
});
