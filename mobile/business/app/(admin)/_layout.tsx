import { useEffect } from "react";
import { Redirect, Tabs, usePathname } from "expo-router";
import { colors, type } from "@alassema/core";
import { useLiveEvents } from "@alassema/mobile-shared";
import { useStaffAuth } from "../../lib/staffAuth";
import { isAdmin } from "../../lib/permissions";
import Icon, { type IconName } from "../../components/Icon";
import {
  bumpLeadsBadge,
  clearLeadsBadge,
  useLeadsBadge,
  bumpMessagesBadge,
  clearMessagesBadge,
  useMessagesBadge,
  badgeLabel,
} from "../../lib/liveBadges";
import { refreshAllQueues, useTotalPendingApprovals } from "../../lib/approvalsStore";

// No SSE event exists for the five moderation queues (see phase-9's own
// "Realtime / push" note) — a slow interval is the correct fallback, not a
// poll fast enough to feel live. 3 minutes: often enough that the tab badge
// stays roughly honest, far too slow to matter as load.
const APPROVALS_POLL_MS = 3 * 60_000;

/**
 * `tabBarIcon` factory. Hoisted to module scope rather than written inline per
 * screen so the six call sites below stay one line each, and so the component
 * identity is stable across renders.
 *
 * ── Why this had to exist at all ───────────────────────────────────────────
 * These tabs previously passed only `title`. @react-navigation/bottom-tabs
 * does NOT then render a label-only tab — it falls back to its built-in
 * placeholder glyph, which shipped as a row of empty boxes (tofu) under every
 * label on a real device. A missing `tabBarIcon` is not a no-op; it is a
 * visible defect.
 */
function tabIcon(name: IconName) {
  return ({ color, size }: { color: string; size: number }) => (
    <Icon name={name} color={color} size={size} />
  );
}

/**
 * Admin tab group: Overview · Leads · Approvals · Messages · Companies · More.
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
  const approvalsBadge = useTotalPendingApprovals();
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

  useEffect(() => {
    if (!user) return;
    void refreshAllQueues();
    const interval = setInterval(() => void refreshAllQueues(), APPROVALS_POLL_MS);
    return () => clearInterval(interval);
  }, [user]);

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
      <Tabs.Screen name="overview" options={{ title: "الرئيسية", tabBarIcon: tabIcon("dashboard") }} />
      <Tabs.Screen name="leads" options={{ title: "الطلبات", tabBarIcon: tabIcon("inbox"), tabBarBadge: badgeLabel(leadsBadge) }} />
      <Tabs.Screen name="approvals" options={{ title: "الموافقات", tabBarIcon: tabIcon("rate_review"), tabBarBadge: badgeLabel(approvalsBadge) }} />
      <Tabs.Screen name="messages" options={{ title: "الرسائل", tabBarIcon: tabIcon("forum"), tabBarBadge: badgeLabel(messagesBadge) }} />
      <Tabs.Screen name="companies" options={{ title: "الشركات", tabBarIcon: tabIcon("business") }} />
      <Tabs.Screen name="more" options={{ title: "المزيد", tabBarIcon: tabIcon("more_horiz") }} />
    </Tabs>
  );
}
