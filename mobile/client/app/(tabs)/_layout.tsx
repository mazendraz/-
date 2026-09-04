import { useEffect } from "react";
import { Tabs } from "expo-router";
import { usePushNotifications, useLiveEvents } from "@alassema/mobile-shared";
import { useCustomerAuth } from "../../lib/customerAuth";
import {
  refreshUnreadMessages,
  refreshUnreadNotifications,
  resetUnread,
} from "../../lib/unreadStore";

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
  // The tab bar's red badges. Same rationale as the line above: an
  // account-level concern, mounted once for the whole group rather than by
  // whichever screen happens to be on top. This layout stays mounted for the
  // life of the session (it is the bottom of the root stack), so the badges
  // keep up while the customer is three screens deep inside another tab.
  useBadgeCountsSync();

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

/**
 * Keeps lib/unreadStore.ts current — both counts the bar draws: unread chat
 * messages (الرسائل) and unread notifications (حسابي).
 *
 * Three triggers, and each covers a hole the other two leave:
 *   - the signed-in account changing (including the first sign-in of the
 *     session, and sign-OUT, which must wipe the previous account's counts
 *     rather than leave them on the bar);
 *   - a live event, which is what makes a reply light the badge within a
 *     second while the app is open;
 *   - a slow interval, the same 45s fallback messages.tsx already runs, for
 *     the case the SSE stream is reconnecting or silently never delivered an
 *     event this session (see liveEvents.ts).
 *
 * The two counts listen to DIFFERENT event types, and deliberately so. A chat
 * reply is the only thing that moves the message count, so that one stays on
 * `message` alone. A Notification row is written for lead creation, status
 * changes and completion as well as chat (notifications.customer.service's
 * notifyCustomer call sites), so its count has to take the lead events too —
 * and `reconnect`, because the categories with no live event at all
 * (WAITLIST_NOTIFIED, MARKETING) would otherwise wait out the full interval
 * every time the stream drops. `favorite` and `profile` write no
 * notification, so they are the two that are skipped.
 */
const NOTIFYING_EVENTS = new Set(["message", "lead", "lead-status", "reconnect"]);

function useBadgeCountsSync(): void {
  // The id, not the object: `customer` is replaced wholesale on every profile
  // refresh (see customerAuth's setSnapshot), and keying the effects on the
  // object would refetch on changes that have nothing to do with who is
  // signed in.
  const customerId = useCustomerAuth().customer?.id ?? null;

  useEffect(() => {
    if (!customerId) {
      resetUnread();
      return;
    }
    const refreshAll = () => {
      void refreshUnreadMessages();
      void refreshUnreadNotifications();
    };
    refreshAll();
    const id = setInterval(refreshAll, 45_000);
    return () => clearInterval(id);
  }, [customerId]);

  useLiveEvents((event) => {
    if (event.type === "message") void refreshUnreadMessages();
    if (NOTIFYING_EVENTS.has(event.type)) void refreshUnreadNotifications();
  });
}
