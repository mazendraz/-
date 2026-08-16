/**
 * `@alassema/core` — the shared contract and the pure helpers over it.
 *
 * Consumed by the API, the website, and (from phase 3) both mobile apps. See
 * README.md for what belongs here and what must never be imported into it.
 */
export type * from "./apiTypes";
export type { Locale } from "./locale";
// Runtime — the first real code to live here, and the reason the package is a
// workspace member rather than a types-only alias.
export * from "./plural";
