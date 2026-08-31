/**
 * Native push registration — shared by both mobile apps.
 *
 * ── Why every function below was checked against the installed package ──────
 * expo-notifications' handler shape changed across SDK versions — this
 * version wants `shouldShowBanner` / `shouldShowList`, not the older
 * `shouldShowAlert` a memory of a previous SDK would reach for — and the
 * tap-to-open API is `useLastNotificationResponse()`, a hook, rather than
 * only the imperative listener a prior version's docs might show first. Read
 * from node_modules/expo-notifications/build/*.d.ts directly, matching this
 * codebase's standing rule (AGENTS.md) not to trust memory or a summarized
 * docs page over the package actually installed.
 *
 * ── Where the token goes ──────────────────────────────────────────────────
 * `devicePath` (from configure() — see config.ts) upserts on the token, so
 * re-registering on every launch is free and is what keeps a re-signed-in-as-
 * someone-else phone from still notifying the previous account — see that
 * route's comment on api's side (expoPush.service.registerDevice). The client
 * app registers at "/customer/push-device"; the Business App at
 * "/push/device" — the one route api's own comments describe as "the
 * BUSINESS app (staff)".
 *
 * ── Who's signed in ────────────────────────────────────────────────────────
 * Same as liveEvents.ts: this module reads the signed-in subject id from
 * session.ts's useAuthSubject(), kept current by each app's own auth-state
 * module, rather than importing customerAuth.ts or staffAuth.ts directly.
 */
import { useEffect } from "react";
import { AppState, Platform } from "react-native";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { router } from "expo-router";
import { getConfig } from "./config";
import { apiPost, apiDelete } from "./api";
import { useAuthSubject } from "./session";

// Foreground behavior: show the banner and add it to the notification list,
// no sound (a reply is not an alarm, matching the website's Notification API
// — a visible toast, not an audible alert), but DO apply the server-set badge
// count (see expoPush.service.ts's `badge: 1`) so the app icon reflects
// "something's waiting" even while the app is open.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: true,
  }),
});

function projectId(): string | undefined {
  return Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
}

/**
 * Ask for permission (if not already asked) and register this device's Expo
 * push token with the account. Never throws — matches every other
 * notification path in this codebase (web-push, Telegram) failing open: a
 * person who declines notifications, or a simulator with no push
 * capability, must not see an error over a feature that's allowed to be
 * silently unavailable.
 */
async function registerForPush(): Promise<void> {
  // Native push has no web equivalent here (the website's Web Push flow is a
  // separate, already-shipped path — push.service.ts on the API side, keyed
  // on browser subscriptions, not Expo tokens). Guarded explicitly rather
  // than discovered by another synchronous throw: expo-notifications'
  // useLastNotificationResponse() crashes outright on web rather than
  // degrade, so the other calls in this function get the same preemptive
  // guard instead of being trusted one by one.
  if (Platform.OS === "web") return;

  // Physical devices only — a push token requires real APNs/FCM registration
  // that simulators and emulators cannot provide.
  if (!Device.isDevice) return;

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== "granted") {
    status = (await Notifications.requestPermissionsAsync()).status;
  }
  if (status !== "granted") return;

  const id = projectId();
  if (!id) {
    // No EAS project linked yet (pre-`eas init`) — expected before the app
    // has been through EAS setup. Not an error state, just not configured.
    return;
  }

  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: id });
    await apiPost(getConfig().devicePath, {
      token,
      platform: Platform.OS as "ios" | "android",
      deviceName: Constants.deviceName ?? undefined,
    });
  } catch (err) {
    console.warn("Push registration failed:", err);
  }
}

/**
 * Forget this device's push token, both locally-known state and server-side
 * — what sign-out calls. Resolves the SAME token registerForPush would (Expo
 * tokens are stable for the life of an install), rather than persisting one
 * separately, so there is nothing to keep in sync between the two.
 *
 * Never prompts: if permission was never granted there was nothing to
 * unregister, and asking someone in the middle of signing OUT to grant
 * notification permission would be bizarre. Never throws — same fail-open
 * contract as registerForPush; a sign-out must complete even if this fails.
 */
export async function unregisterPush(): Promise<void> {
  if (Platform.OS === "web" || !Device.isDevice) return;
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") return;
    const id = projectId();
    if (!id) return;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: id });
    await apiDelete(getConfig().devicePath, { token });
  } catch (err) {
    console.warn("Push unregistration failed:", err);
  }
}

/**
 * Registers for push once per signed-in session, and wires a tap on a
 * notification to open the screen it's about — mirrors the website's
 * notificationclick handler in sw.js reading the same `data.url`.
 *
 * Mounted once, high in the tree (each app's own root/tab layout) rather than
 * per-screen: registration and tap-handling are account-level concerns, not
 * screen-level ones, and mounting it per-screen would mean re-registering on
 * every tab switch for no benefit.
 */
export function usePushNotifications(): void {
  const subjectId = useAuthSubject();

  useEffect(() => {
    if (subjectId) registerForPush();
  }, [subjectId]);

  // Badge clears when the app comes to the foreground — "you're looking at
  // it now" is the simplest honest reset point without a server-side unread
  // count to reconcile against. Runs once on mount too (AppState's listener
  // only fires on a SUBSEQUENT transition), so a cold launch also clears
  // whatever badge was showing before the app opened.
  useEffect(() => {
    if (Platform.OS === "web") return;
    Notifications.setBadgeCountAsync(0).catch(() => {});
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") Notifications.setBadgeCountAsync(0).catch(() => {});
    });
    return () => sub.remove();
  }, []);

  // `Platform.OS === "web"` branches the WHOLE hook body — not just a value
  // inside it — which is safe specifically because Platform.OS is a constant
  // for the lifetime of a running app: it cannot change between one render of
  // this component and the next, so this can't violate React's "same hooks
  // every render" rule the way branching on a piece of STATE would.
  //
  // The branch exists because `Notifications.useLastNotificationResponse()`
  // doesn't degrade gracefully on web the way expo-secure-store's functions
  // do — it throws synchronously ("ExpoNotifications.getLastNotificationResponse
  // is not available on web"), which took the whole authenticated shell down
  // with it, caught only because web is one of these apps' real render
  // targets (see liveEvents.ts's comment on the same point).
  if (Platform.OS === "web") return;

  // eslint-disable-next-line react-hooks/rules-of-hooks -- see comment above
  const response = Notifications.useLastNotificationResponse();
  useEffect(() => {
    const url = response?.notification.request.content.data?.url;
    if (typeof url === "string" && url.startsWith("/")) {
      // mapNotificationUrl defaults to identity (see config.ts) — the client
      // app's own routes already match what the server sends, so this is a
      // no-op there. The Business App supplies a real mapper.
      const mapped = (getConfig().mapNotificationUrl ?? ((u: string) => u))(url);
      router.push(mapped as never);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [response]);
}
