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

import "expo-router/entry";
