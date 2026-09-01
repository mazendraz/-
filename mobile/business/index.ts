/**
 * Custom entry point, ahead of expo-router's own. `Intl.PluralRules` is not
 * available on every Hermes build this app ships to — confirmed on a real
 * device for mobile/client (SDK 57, iOS): `packages/core/src/plural.ts`
 * constructs `new Intl.PluralRules(...)` at MODULE LOAD TIME, and on an
 * engine without it that throws before a single screen renders, taking the
 * whole app down (every route file imports `@alassema/core` for
 * `colors`/`type`, so the crash cascades into "missing default export" on
 * every one of them). This app shares that dependency, so it inherits the
 * same fix.
 *
 * The polyfill packages self-guard (a no-op where native support already
 * exists), so this is safe to always import. It has to run before ANYTHING
 * else requires `@alassema/core` — package.json's `main` points HERE instead
 * of straight at `expo-router/entry` specifically so these lines are the
 * first thing Metro evaluates.
 */
import "@formatjs/intl-getcanonicallocales/polyfill.js";
import "@formatjs/intl-pluralrules/polyfill.js";
import "@formatjs/intl-pluralrules/locale-data/ar.js";
import "@formatjs/intl-pluralrules/locale-data/en.js";

// @alassema/mobile-shared's api.ts/liveEvents.ts/push.ts all read their
// baseUrl/paths from configure() (see packages/mobile-shared/src/config.ts)
// rather than reading EXPO_PUBLIC_* directly — this is the one call that
// wires THIS app's own env vars and staff-specific routes into it, and it
// has to run before any route file gets a chance to call apiGet/apiPost/etc.
// Same reasoning as the polyfills above: package.json's `main` points HERE
// precisely so this line runs first.
import Constants from "expo-constants";
import { configure } from "@alassema/mobile-shared";
import { mapNotificationUrl } from "./lib/deepLinks";

configure({
  // Expo only inlines env vars prefixed EXPO_PUBLIC_ into the client bundle.
  baseUrl: (
    process.env.EXPO_PUBLIC_API_URL ??
    (Constants.expoConfig?.extra?.apiUrl as string | undefined) ??
    ""
  ).replace(/\/$/, ""),
  apiKey: (process.env.EXPO_PUBLIC_API_KEY ?? "").trim(),
  // See .env.example's own explanation — blank in production (derived from
  // baseUrl), a LAN IP pointing at the website dev server in local dev.
  assetUrl: (process.env.EXPO_PUBLIC_ASSET_URL ?? "").trim().replace(/\/$/, ""),
  // Staff routes — see api's src/app/api/auth/{refresh,sessions}/route.ts
  // and docs/architecture/business-app/phase-0-backend-sessions.md.
  refreshPath: "/auth/refresh",
  // Both PROVIDER and ADMIN subscribe through this one route — see api's
  // provider/stream/route.ts, which derives the channel list (company vs.
  // admins) from the authenticated session, never from a request param.
  streamPath: "/provider/stream",
  // The route api's own comment calls "the BUSINESS app (staff)" —
  // see api/src/app/api/push/device/route.ts.
  devicePath: "/push/device",
  // Server payloads still name web dashboard paths ("/provider",
  // "/admin?tab=chat") — see lib/deepLinks.ts for why, and why "/" is the
  // correct fallback for anything unmapped.
  mapNotificationUrl,
  // A fully independent version-gate kill switch from the client app's —
  // see api's app-version/route.ts B5 and config.ts's own comment.
  appVersionQuery: "business",
});

import "expo-router/entry";
