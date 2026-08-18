import { Tabs, router } from "expo-router";
import { colors, type } from "@alassema/core";
import Icon from "../../components/Icon";
import { useCustomerAuth } from "../../lib/customerAuth";
import { usePushNotifications } from "../../lib/push";

/**
 * The tab shell: Home, Companies, Requests, Messages, Saved, Account.
 *
 * Guest browsing (phase 1): Home and Companies are open to everyone. The
 * other four require an account — tapping one as a guest is intercepted here
 * (tabPress) and redirected to sign-in with `next` set to come straight back.
 * Each of those screens ALSO guards itself with useRequireAccount (see
 * lib/authGate.ts), for deep links and for a customer signing out while
 * sitting on the tab — cases a tab-bar intercept alone can't cover.
 */
export default function TabsLayout() {
  const { customer, loading } = useCustomerAuth();
  // Registration + tap-to-open are account-level concerns (see push.ts),
  // mounted once here rather than per-screen. Called unconditionally (hooks
  // can't be conditional) — it internally no-ops until `customer` exists.
  usePushNotifications();

  if (loading) return null;

  function guardTab(next: string) {
    return {
      tabPress: (e: { preventDefault: () => void }) => {
        if (!customer) {
          e.preventDefault();
          router.push({ pathname: "/sign-in", params: { next } });
        }
      },
    };
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.outline,
        tabBarStyle: { backgroundColor: colors.surfaceContainerLowest, borderTopColor: colors.outlineVariant },
        tabBarLabelStyle: { fontFamily: "Cairo_600SemiBold", fontSize: type.caption.fontSize },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: "الرئيسية",
          tabBarIcon: ({ color, size }) => <Icon name="home" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="companies"
        options={{
          title: "الشركات",
          tabBarIcon: ({ color, size }) => <Icon name="search" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="requests"
        options={{
          title: "طلباتي",
          tabBarIcon: ({ color, size }) => <Icon name="receipt_long" color={color} size={size} />,
        }}
        listeners={guardTab("/requests")}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: "الرسائل",
          tabBarIcon: ({ color, size }) => <Icon name="forum" color={color} size={size} />,
        }}
        listeners={guardTab("/messages")}
      />
      <Tabs.Screen
        name="saved"
        options={{
          title: "المفضلة",
          tabBarIcon: ({ color, size }) => <Icon name="favorite" color={color} size={size} />,
        }}
        listeners={guardTab("/saved")}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: "حسابي",
          tabBarIcon: ({ color, size }) => <Icon name="person" color={color} size={size} />,
        }}
        listeners={guardTab("/account")}
      />
    </Tabs>
  );
}
