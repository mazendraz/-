/**
 * The API contract — now defined once, in `@alassema/core`.
 *
 * This file stays as a re-export so every existing `../lib/apiTypes` import
 * keeps working untouched. `export type *`, not `export *`: everything here is a
 * type, so the statement is erased at compile time and Vite never resolves a
 * path outside this package — which is why no alias was needed in
 * vite.config.ts.
 *
 * What this replaced was a hand-maintained copy of the same shapes, under a
 * comment asking whoever edited one to remember the other. It had drifted in
 * BOTH directions: the API's `ApiLead` had grown `items`, `completion` and four
 * more fields this file never gained, while this file carried
 * `ApiOfferingTier.isPublished` and `ApiCategory.publishedOfferingCompanyCount`
 * that the API's copy had never gained. Both sides are now folded into core.
 */
export type * from "@alassema/core";
