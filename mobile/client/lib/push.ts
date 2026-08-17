/**
 * Native push registration for the CUSTOMER app.
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
 * POST /api/v1/customer/push-device (built in phase 0.5, unexercised by any
 * client until now) upserts on the token, so re-registering on every launch
 * is free and is what keeps a re-signed-in-as-someone-else phone from still
 * notifying the previous account — see that route's comment.
 */
import { useEffect } from "react";
import { Platform } from "react-native";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { router } from "expo-router";
import { apiPost } from "./api";
import { useCustomerAuth } from "./customerAuth";

// Foreground behavior: show the banner and add it to the notification list,
// but no sound — a reply from a provider is not an alarm. Matches the
// website's Notification API usage (a visible toast, not an audible alert).
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

function projectId(): string | undefined {
  return Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
}

/**
 * Ask for permission (if not already asked) and register this device's Expo
 * push token with the account. Never throws — matches every other
 * notification path in this codebase (web-push, Telegram) failing open: a
 * customer who declines notifications, or a simulator with no push
 * capability, must not see an error over a feature that's allowed to be
 * silently unavailable.
 */
async function registerForPush(): Promise<void> {
  // Native push has no web equivalent here (the website's Web Push flow is a
  // separate, already-shipped path — push.service.ts on the API side, keyed
  // on browser subscriptions, not Expo tokens). Guarded explicitly rather
  // than discovered by another synchronous throw: this session already found
  // expo-notifications' useLastNotificationResponse() crash outright on web
  // rather than degrade, so the other calls in this function get the same
  // preemptive guard instead of being trusted one by one.
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
    await apiPost("/customer/push-device", {
      token,
      platform: Platform.OS as "ios" | "android",
      deviceName: Constants.deviceName ?? undefined,
    });
  } catch (err) {
    console.warn("Push registration failed:", err);
  }
}

/**
 * Registers for push once per signed-in session, and wires a tap on a
 * notification to open the request it's about — mirrors the website's
 * notificationclick handler in sw.js reading the same `data.url`.
 *
 * Mounted once, high in the tree (see app/(tabs)/_layout.tsx) rather than per-
 * screen: registration and tap-handling are account-level concerns, not
 * screen-level ones, and mounting it per-screen would mean re-registering on
 * every tab switch for no benefit.
 */
export function usePushNotifications(): void {
  const { customer } = useCustomerAuth();

  useEffect(() => {
    if (customer) registerForPush();
  }, [customer]);

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
  // with it, caught only because web is one of this app's real render
  // targets (see liveEvents.ts's comment on the same point).
  if (Platform.OS === "web") return;

  // eslint-disable-next-line react-hooks/rules-of-hooks -- see comment above
  const response = Notifications.useLastNotificationResponse();
  useEffect(() => {
    const url = response?.notification.request.content.data?.url;
    if (typeof url === "string" && url.startsWith("/")) {
      // Same shape api's push payloads already send for the web (a relative
      // path like "/provider/leads") — expo-router's `router.push` accepts it
      // directly, no parsing needed.
      router.push(url as never);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [response]);
}
