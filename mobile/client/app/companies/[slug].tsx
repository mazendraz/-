import { Redirect, useLocalSearchParams } from "expo-router";

/**
 * Universal Link / App Link alias for the website's route shape.
 *
 * The website's company profile lives at `/companies/:slug` (plural — see
 * app/src/router.tsx), and that is the exact path the site's own
 * `.well-known/apple-app-site-association` declares as app-linked
 * ("/companies/*"). This app's real screen is `/company/[slug]` (singular —
 * see app/company/[slug].tsx). Without this file, a Universal Link to
 * https://alassema.com/companies/some-company had no matching route in this
 * app's file-based router at all and would 404 inside the app instead of
 * opening the profile it pointed at.
 *
 * A redirect, not a duplicate screen: the real company profile stays at
 * exactly one place, and this only exists to catch the one URL shape an
 * external link can arrive with.
 */
export default function CompaniesSlugRedirect() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  return <Redirect href={{ pathname: "/company/[slug]", params: { slug } }} />;
}
