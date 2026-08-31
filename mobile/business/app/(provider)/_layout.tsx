import { useEffect } from "react";
import { Redirect, Tabs, usePathname } from "expo-router";
import { colors, type } from "@alassema/core";
import { useLiveEvents } from "@alassema/mobile-shared";
import { useStaffAuth } from "../../lib/staffAuth";
import { isAdmin, isProvider } from "../../lib/permissions";
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
 * Provider tab group: Overview · Leads · Messages · More.
 *
 * Every screen under here calls `/provider/*` routes, which are
 * `withRole("PROVIDER")` on the server — strict equality, so an ADMIN 403s
 * on all of them. This layout is what keeps an admin from ever mounting a
 * screen that can only fail: it redirects to the admin group instead of
 * rendering anything here.
 *
 * One useLiveEvents subscription for the whole tab bar (not one per screen)
 * bumps a badge on a new `lead`/`message` event — but only while the
 * matching tab genuinely isn't the one on screen; a badge on the tab
 * someone is already looking at, which is already refetching live, would
 * just be visual noise. (Known gap, accepted: viewing a specific open
 * thread at /chat/[id] still bumps Messages for an event on THAT SAME
 * conversation, since this check only knows about the tab routes, not the
 * detail routes layered above them. Low-harm — the badge is mildly
 * redundant there, never wrong.)
 */
export default function ProviderTabsLayout() {
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

  // Side-effecting calls (they notify other subscribers of these stores)
  // belong in an effect, not the render body — calling them directly here
  // would fire a state update while THIS component is still rendering.
  useEffect(() => {
    if (onLeadsTab) clearLeadsBadge();
    if (onMessagesTab) clearMessagesBadge();
  }, [onLeadsTab, onMessagesTab]);

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
      <Tabs.Screen name="leads" options={{ title: "الطلبات", tabBarBadge: badgeLabel(leadsBadge) }} />
      <Tabs.Screen name="messages" options={{ title: "الرسائل", tabBarBadge: badgeLabel(messagesBadge) }} />
      <Tabs.Screen name="more" options={{ title: "المزيد" }} />
    </Tabs>
  );
}
