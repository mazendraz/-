import { useEffect } from "react";
import { Redirect, Tabs, usePathname } from "expo-router";
import { colors, type } from "@alassema/core";
import { useLiveEvents } from "@alassema/mobile-shared";
import { useStaffAuth } from "../../lib/staffAuth";
import { isAdmin } from "../../lib/permissions";
import {
  bumpLeadsBadge,
  clearLeadsBadge,
  useLeadsBadge,
  bumpMessagesBadge,
  clearMessagesBadge,
  useMessagesBadge,
  badgeLabel,
} from "../../lib/liveBadges";

/**
 * Admin tab group: Overview · Leads · Approvals · Messages · More.
 *
 * Every screen under here calls `/admin/*` routes (`withRole("ADMIN")`) —
 * a PROVIDER 403s on all of them, so this layout redirects one to the
 * provider group rather than mounting a screen that can only fail. See
 * lib/permissions.ts's header comment for why there is no "either" case.
 *
 * Shares liveBadges' counters with the provider layout — the two tab
 * groups are never mounted at the same time for one signed-in account (a
 * staff member is exactly one role), so module-level state is enough.
 */
export default function AdminTabsLayout() {
  const { user } = useStaffAuth();
  const pathname = usePathname();
  const leadsBadge = useLeadsBadge();
  const messagesBadge = useMessagesBadge();
  const onLeadsTab = pathname.includes("/leads");
  const onMessagesTab = pathname.includes("/messages");

  useLiveEvents((event) => {
    if (event.type === "lead" && !onLeadsTab) bumpLeadsBadge();
    if (event.type === "message" && !onMessagesTab) bumpMessagesBadge();
  });

  useEffect(() => {
    if (onLeadsTab) clearLeadsBadge();
    if (onMessagesTab) clearMessagesBadge();
  }, [onLeadsTab, onMessagesTab]);

  if (!user) return <Redirect href="/sign-in" />;
  if (!isAdmin(user)) return <Redirect href="/(provider)/overview" />;

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
      <Tabs.Screen name="leads" options={{ title: "الطلبات", tabBarBadge: badgeLabel(leadsBadge) }} />
      <Tabs.Screen name="approvals" options={{ title: "الموافقات" }} />
      <Tabs.Screen name="messages" options={{ title: "الرسائل", tabBarBadge: badgeLabel(messagesBadge) }} />
      <Tabs.Screen name="more" options={{ title: "المزيد" }} />
    </Tabs>
  );
}
