import { Redirect, Tabs } from "expo-router";
import { colors, type } from "@alassema/core";
import { useStaffAuth } from "../../lib/staffAuth";
import { isAdmin, isProvider } from "../../lib/permissions";

/**
 * Provider tab group: Overview · Leads · Messages · More.
 *
 * Every screen under here calls `/provider/*` routes, which are
 * `withRole("PROVIDER")` on the server — strict equality, so an ADMIN 403s
 * on all of them. This layout is what keeps an admin from ever mounting a
 * screen that can only fail: it redirects to the admin group instead of
 * rendering anything here.
 */
export default function ProviderTabsLayout() {
  const { user } = useStaffAuth();

  if (!user) return <Redirect href="/sign-in" />;
  if (isAdmin(user)) return <Redirect href="/(admin)/overview" />;
  if (!isProvider(user)) return <Redirect href="/sign-in" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.onSurfaceVariant,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.outlineVariant },
        tabBarLabelStyle: { fontFamily: "Cairo_600SemiBold", fontSize: type.caption.fontSize },
      }}
    >
      <Tabs.Screen name="overview" options={{ title: "الرئيسية" }} />
      <Tabs.Screen name="leads" options={{ title: "الطلبات" }} />
      <Tabs.Screen name="messages" options={{ title: "الرسائل" }} />
      <Tabs.Screen name="more" options={{ title: "المزيد" }} />
    </Tabs>
  );
}
