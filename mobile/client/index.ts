/**
 * Custom entry point, ahead of expo-router's own. `Intl.PluralRules` is not
 * available on every Hermes build this app ships to — confirmed on a real
 * device (SDK 57, iOS): `packages/core/src/plural.ts` constructs
 * `new Intl.PluralRules(...)` at MODULE LOAD TIME, and on an engine without
 * it that throws before a single screen renders, taking the whole app down
 * (every route file imports `@alassema/core` for `colors`/`type`, so the
 * crash cascades into "missing default export" on every one of them).
 *
 * The polyfill packages self-guard (a no-op where native support already
 * exists), so this is safe to always import. It has to run before ANYTHING
 * else requires `@alassema/core` — package.json's `main` points HERE instead
 * of straight at `expo-router/entry` specifically so these two lines are the
 * first thing Metro evaluates.
 */
import "@formatjs/intl-getcanonicallocales/polyfill.js";
import "@formatjs/intl-pluralrules/polyfill.js";
import "@formatjs/intl-pluralrules/locale-data/ar.js";
import "@formatjs/intl-pluralrules/locale-data/en.js";

// @alassema/mobile-shared's api.ts/liveEvents.ts/push.ts all read their
// baseUrl/paths from configure() rather than reading EXPO_PUBLIC_* directly
// (see packages/mobile-shared/src/config.ts) — this is the one call that
// wires this app's own env vars into it, and it has to run before any route
// file gets a chance to call apiGet/apiPost/etc. Same reasoning as the
// polyfills above: package.json's `main` points HERE precisely so this line
// runs first.
import Constants from "expo-constants";
import { configure } from "@alassema/mobile-shared";

configure({
  // Expo only inlines env vars prefixed EXPO_PUBLIC_ into the client bundle —
  // the direct counterpart of Vite's VITE_ prefix, and for the same reason
  // (anything without it could be a server-only secret, so the bundler
  // refuses to ship it to the device). extra.apiUrl is an unused fallback
  // today (nothing in app.json/eas.json sets it) — carried over unchanged
  // from before this moved, not a new behavior.
  baseUrl: (
    process.env.EXPO_PUBLIC_API_URL ??
    (Constants.expoConfig?.extra?.apiUrl as string | undefined) ??
    ""
  ).replace(/\/$/, ""),
  // Mirrors the website's VITE_API_KEY — same optional shared-secret gate.
  // Currently unset on the server, so this is a no-op today.
  apiKey: (process.env.EXPO_PUBLIC_API_KEY ?? "").trim(),
  // See .env.example's own explanation — blank in production (derived from
  // baseUrl), a LAN IP pointing at the website dev server in local dev.
  assetUrl: (process.env.EXPO_PUBLIC_ASSET_URL ?? "").trim().replace(/\/$/, ""),
  refreshPath: "/auth/customer/refresh",
  streamPath: "/customer/stream",
  devicePath: "/customer/push-device",
  // No mapNotificationUrl — this app's own routes already match the paths
  // the server sends in a push payload's `url`, unlike the Business App
  // (see phase 4's deepLinks.ts).
});

import "expo-router/entry";
