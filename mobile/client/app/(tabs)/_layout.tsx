import { Redirect, Tabs } from "expo-router";
import { colors, type } from "@alassema/core";
import Icon from "../../components/Icon";
import { useCustomerAuth } from "../../lib/customerAuth";
import { usePushNotifications } from "../../lib/push";

/**
 * The signed-in shell. Two tabs today — Requests and Account — because those
 * are the only two screens that exist. Browsing services/companies belongs
 * here once it's built; the tab bar is not a preview of the eventual
 * navigation, it's exactly what's real right now.
 *
 * Guards itself rather than trusting index.tsx's redirect alone: a customer
 * who signs out while sitting on a tab (or a deep link that lands here
 * directly) must not see an authenticated screen with no session behind it.
 */
export default function TabsLayout() {
  const { customer, loading } = useCustomerAuth();
  // Registration + tap-to-open are account-level concerns (see push.ts),
  // mounted once here rather than per-screen. Called unconditionally (hooks
  // can't be conditional) — it internally no-ops until `customer` exists.
  usePushNotifications();

  if (loading) return null;
  if (!customer) return <Redirect href="/sign-in" />;

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
      />
      <Tabs.Screen
        name="account"
        options={{
          title: "حسابي",
          tabBarIcon: ({ color, size }) => <Icon name="person" color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
