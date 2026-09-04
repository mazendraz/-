/**
 * `@alassema/mobile-shared` — the infrastructure both mobile apps need and
 * neither should maintain twice: the HTTP client, on-device token storage,
 * the live-event SSE connection, native push registration, the app-version
 * gate, RTL setup, and font loading.
 *
 * Call configure() (see config.ts) once, at app startup, before importing
 * anything else from here that touches the network or storage.
 *
 * See docs/architecture/business-app/phase-1-shared-package.md for why these
 * seven modules were extracted here and not others (the client app's UI
 * components stayed put — they're a consumer browsing surface, where the
 * Business App's is a dense operational one; they share tokens, not markup).
 */
export * from "./config";
export * from "./session";
export * from "./api";
export * from "./liveEvents";
export * from "./push";
export * from "./appVersion";
export * from "./rtl";
export * from "./fonts";
export * from "./backendHealth";
export * from "./maintenance";
export * from "./useRefreshOnFocus";
export * from "./useCoalescedReload";
export * from "./useSingleSubmit";
export * from "./errorReporting";
export * from "./settings";
export * from "./assetUrl";
