// The one place a page NUMBER is bounded.
//
// Every paginated service used to inline the same expression:
//
//   const page = Math.max(1, Math.trunc(query.page ?? 1) || 1);
//
// — nine copies, and every one of them bounded the page from BELOW only. A page
// size has always been capped (MAX_PAGE_SIZE, per service); the page index never
// was. So `?page=99999999999999999999` parsed to 1e20, became `skip` of 2e21,
// and overflowed the i64 the OFFSET is carried in — turning an unauthenticated
// GET (/api/companies, /api/companies/:slug/reviews, /api/site-reviews are all
// public) into a 500 from a single URL, with no body and no rate limit hit.
//
// A duplicated bound is a bound that will be forgotten in the tenth copy, which
// is why this is a shared function rather than nine more edits.

/**
 * Highest page index any caller may request.
 *
 * 100,000 pages is ~2,000,000 rows at the largest page size these endpoints
 * allow — orders of magnitude past any real reader, and far below the point
 * where the arithmetic stops fitting. Past it, clamping answers with an honest
 * empty page instead of an error: a nonsense page number is a client mistake,
 * not a server failure, and a 500 tells the caller the wrong thing.
 */
export const MAX_PAGE = 100_000;

/**
 * Normalize a requested page index to `1 .. MAX_PAGE`.
 *
 * Absent, zero, negative, fractional, NaN and Infinity all resolve to a usable
 * index rather than propagating into the query — `Math.trunc` drops fractions,
 * `|| 1` catches NaN and 0 (and -0), and the two bounds catch the rest.
 */
export function clampPage(page: number | undefined): number {
  return Math.min(MAX_PAGE, Math.max(1, Math.trunc(page ?? 1) || 1));
}

/**
 * Normalize a requested page size to `1 .. max`, defaulting when absent.
 * Same contract as clampPage for junk values.
 */
export function clampPageSize(
  pageSize: number | undefined,
  defaultSize: number,
  maxSize: number,
): number {
  const raw = Math.trunc(pageSize ?? defaultSize) || defaultSize;
  return Math.min(maxSize, Math.max(1, raw));
}
