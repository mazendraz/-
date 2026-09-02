import { Tabs } from "expo-router";
import { usePushNotifications } from "@alassema/mobile-shared";
import { useCustomerAuth } from "../../lib/customerAuth";

/**
 * The tab GROUP. Note what this no longer is: the thing that draws the bottom
 * bar.
 *
 * ── What changed, and why ───────────────────────────────────────────────────
 * This navigator used to render the bar via `tabBar={(props) => <TabBar/>}`,
 * which meant the bar was the navigator's own furniture and existed only
 * while one of these five screens was the top of the root stack. Every
 * internal screen in the app (`/services`, `/company/[slug]`, `/search`,
 * `/chat/[leadId]`, `/new-request/[slug]`, `/notifications`, `/legal/[kind]`)
 * is a SIBLING of this group in that stack, so pushing one covered this
 * navigator entirely and the bar went with it — the "bottom bar disappears
 * one level deep" bug. The bar now belongs to components/AppShell.tsx, which
 * wraps the whole navigator instead of living inside it.
 *
 * `tabBar={() => null}` rather than deleting the navigator, because the two
 * things it still does are exactly the two things the fix must not lose:
 *   1. It keeps all five screens MOUNTED, so switching tabs preserves each
 *      one's scroll position, filters and loaded data — requirement "do not
 *      unnecessarily reset nested navigation stacks".
 *   2. It owns the five routes, so `/home`, `/companies`, … keep resolving
 *      and every existing deep link still lands where it did.
 * With the bar returning null the navigator reserves no space for one, so the
 * shell's bar is the only bottom chrome on screen — there is no second bar
 * and no gap where one used to be.
 *
 * The per-screen `tabBarIcon` / `title` / `tabPress` guard options are gone
 * from here for the same reason: nothing renders them any more. Labels,
 * icons and the guest guards moved to lib/navShell.ts's TABS, which is the
 * single source of truth the shell's bar reads. Each gated screen still
 * guards ITSELF with useRequireAccount (lib/authGate.ts) — that is what
 * covers deep links and signing out mid-session, and it never depended on
 * the tab bar.
 *
 * ── Unchanged ───────────────────────────────────────────────────────────────
 * "البحث" is the companies catalogue (companies.tsx): a search field, category
 * and rating filters, and sort — named for what a customer goes there to do
 * rather than for the entity it lists.
 *
 * Saved is still part of this group (same screen it always was) but holds no
 * slot in the bar: it is simply not in TABS. Its doors are the heart button
 * in the Search header — where you save a company in the first place — and
 * the المفضلة row on the Account tab.
 */
export default function TabsLayout() {
  const { loading } = useCustomerAuth();
  // Registration + tap-to-open are account-level concerns (see push.ts),
  // mounted once here rather than per-screen. Called unconditionally (hooks
  // can't be conditional) — it internally no-ops until `customer` exists.
  usePushNotifications();

  if (loading) return null;

  return (
    <Tabs
      // The bar is drawn by the shell, above this navigator — see the header
      // comment. Returning null (rather than `tabBarStyle: { display: "none" }`)
      // is what keeps the navigator from reserving height for a bar it no
      // longer owns.
      screenOptions={{ headerShown: false }}
      tabBar={() => null}
    >
      <Tabs.Screen name="home" />
      <Tabs.Screen name="companies" />
      <Tabs.Screen name="messages" />
      <Tabs.Screen name="requests" />
      <Tabs.Screen name="saved" />
      <Tabs.Screen name="account" />
    </Tabs>
  );
}
