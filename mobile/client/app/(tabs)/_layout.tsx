import { Tabs, router } from "expo-router";
import Icon from "../../components/Icon";
import TabBar, { tabIconLift } from "../../components/TabBar";
import { useCustomerAuth } from "../../lib/customerAuth";
import { showGuestPrompt } from "../../lib/authGate";
import { usePushNotifications } from "../../lib/push";

/**
 * The tab shell: Home, Search, Messages, Requests, Account — five tabs, each
 * an equal fifth of the width. Saved is still part of this group (same screen
 * it always was) but no longer holds a slot in the bar: `href: null` hides it
 * there while leaving /saved fully navigable. Its doors are the heart button
 * in the Search header — where you save a company in the first place — and
 * the المفضلة row on the Account tab.
 *
 * Messages sits in the bar rather than Saved because a thread is a
 * conversation someone is WAITING on: a provider's reply is the one thing in
 * this app that arrives without the customer asking, and a shortlist is not.
 *
 * "البحث" is the companies catalogue (companies.tsx): a search field, category
 * and rating filters, and sort — named for what a customer goes there to do
 * rather than for the entity it lists.
 *
 * Guest browsing (phase 1): Home and Search are open to everyone. The other
 * three require an account — tapping one as a guest is intercepted here
 * (tabPress, which components/TabBar.tsx re-emits by hand; see its header).
 * Messages/Requests show a contextual prompt explaining what signing in
 * unlocks (dismissible — a guest can back out and keep browsing); Account goes
 * straight to sign-in with no prompt, since needing an account to see "your
 * account" needs no explaining. Each of those screens ALSO guards itself with
 * useRequireAccount (see lib/authGate.ts), for deep links and for a customer
 * signing out while sitting on the tab — cases a tab-bar intercept alone
 * can't cover, and now also the only thing standing between a guest and
 * /saved, which no longer has a tab to intercept.
 */
export default function TabsLayout() {
  const { customer, loading } = useCustomerAuth();
  // Registration + tap-to-open are account-level concerns (see push.ts),
  // mounted once here rather than per-screen. Called unconditionally (hooks
  // can't be conditional) — it internally no-ops until `customer` exists.
  usePushNotifications();

  if (loading) return null;

  function guardTab(next: string, prompt?: { title: string; subtitle: string }) {
    return {
      tabPress: (e: { preventDefault: () => void }) => {
        if (!customer) {
          e.preventDefault();
          if (prompt) {
            showGuestPrompt({ ...prompt, next, secondary: { label: "ليس الآن", kind: "dismiss" } });
          } else {
            router.push({ pathname: "/sign-in", params: { next } });
          }
        }
      },
    };
  }

  return (
    <Tabs
      // Every visual decision the bar used to take from screenOptions (height,
      // padding, tints, label font) now lives in TabBar itself — passing them
      // here as well would leave two sources of truth, one of them dead.
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <TabBar {...props} />}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: "الرئيسية",
          tabBarIcon: ({ color, size, focused }) => (
            <Icon name="home" color={color} size={size} style={tabIconLift(focused)} />
          ),
        }}
      />
      <Tabs.Screen
        name="companies"
        options={{
          title: "البحث",
          tabBarIcon: ({ color, size, focused }) => (
            <Icon name="search" color={color} size={size} style={tabIconLift(focused)} />
          ),
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: "الرسائل",
          tabBarIcon: ({ color, size, focused }) => (
            <Icon name="forum" color={color} size={size} style={tabIconLift(focused)} />
          ),
        }}
        listeners={guardTab("/messages", {
          title: "سجل الدخول لعرض رسائلك",
          subtitle: "سجل الدخول عشان تقدر تتواصل مع الشركات وتشوف ردودهم.",
        })}
      />
      <Tabs.Screen
        name="requests"
        options={{
          title: "طلباتي",
          tabBarIcon: ({ color, size, focused }) => (
            <Icon name="receipt_long" color={color} size={size} style={tabIconLift(focused)} />
          ),
        }}
        listeners={guardTab("/requests", {
          title: "سجل الدخول لمتابعة طلباتك",
          subtitle: "سجل الدخول عشان تقدر تشوف كل طلباتك وتتابع حالتها أول بأول.",
        })}
      />
      <Tabs.Screen
        name="saved"
        options={{
          title: "المفضلة",
          // Off the bar, still routable — see this file's header comment.
          href: null,
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: "حسابي",
          tabBarIcon: ({ color, size, focused }) => (
            <Icon name="person" color={color} size={size} style={tabIconLift(focused)} />
          ),
        }}
        listeners={guardTab("/account")}
      />
    </Tabs>
  );
}
