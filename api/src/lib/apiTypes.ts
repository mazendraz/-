/**
 * The API contract — now defined once, in `@alassema/core`.
 *
 * This file stays as a re-export so the ~100 `@/lib/apiTypes` imports across the
 * API keep working untouched. `export type *`, not `export *`: everything here is
 * a type, so the whole statement is erased at compile time and no bundler ever
 * has to resolve a path outside this package.
 *
 * New code can import from "@alassema/core" directly; there is no hurry, and
 * both spellings resolve to the same declarations either way.
 */
export type * from "@alassema/core";
