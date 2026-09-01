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
 * Admin tab group: Overview · Leads · Messages · Companies · More.
 *
 * Mirrors (provider)/_layout.tsx exactly — same live-badge wiring, same
 * strict-role redirect (see its header comment for why there's no fallback
 * chain: `adminOnly` on the server is strict equality too, so a PROVIDER
 * 403s on every route this tab group's screens call).
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
      <Tabs.Screen name="messages" options={{ title: "الرسائل", tabBarBadge: badgeLabel(messagesBadge) }} />
      <Tabs.Screen name="companies" options={{ title: "الشركات" }} />
      <Tabs.Screen name="more" options={{ title: "المزيد" }} />
    </Tabs>
  );
}
