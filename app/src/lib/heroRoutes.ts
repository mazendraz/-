/**
 * Routes that render their own full-bleed hero/cover image starting at the
 * very top of the viewport, behind a transparent, floating nav — instead of
 * clearing the nav with <main>'s standard top padding like every other page.
 *
 * TopNav's transparency and RootLayout's <main> padding both key off this one
 * predicate so the two can never drift out of sync (see NAV-01: they used to
 * be a matched pair of hardcoded offsets in two different files).
 */
export function hasFullBleedHero(pathname: string): boolean {
  return pathname === "/" || pathname.startsWith("/companies/");
}
