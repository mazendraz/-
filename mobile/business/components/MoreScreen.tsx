import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { colors, type } from "@alassema/core";
import { textStart } from "@alassema/mobile-shared";
import Button from "./Button";
import ScreenHeader from "./ScreenHeader";
import Icon, { type IconName } from "./Icon";
import { signOut, useStaffAuth } from "../lib/staffAuth";
import { isProvider, hasAnyDesktopPermission } from "../lib/permissions";
import { useUnreadNotificationCount } from "../lib/notifications";
import { useTotalPendingApprovals } from "../lib/approvalsStore";

interface MenuItem {
  label: string;
  href: string;
  icon: IconName;
  /** A REAL server-derived count, or undefined. Never a placeholder — a badge
   *  that isn't backed by the backend teaches people to distrust all of them. */
  badge?: number;
}

interface MenuGroup {
  title: string;
  items: MenuItem[];
}

/**
 * The gateway to everything that isn't a tab.
 *
 * ── Why grouped rather than one long list ──────────────────────────────────
 * This screen used to be a flat run of 7 (provider) to 10 (admin) rows in
 * arrival order, which is readable at 7 and stops being readable well before
 * 10 — and the admin list was still growing. Grouping by INTENT ("what am I
 * here to do?") rather than by the phase each feature shipped in means a
 * person scans four short lists instead of one long one, and new features land
 * in an obvious place instead of on the end.
 *
 * ── Every row goes somewhere ───────────────────────────────────────────────
 * There are no section headers without rows, no rows without routes, and no
 * "coming soon". Groups whose items are all permission-gated away are dropped
 * entirely (see `groups()` below) rather than rendering an empty heading.
 */
export default function MoreScreen() {
  const { user } = useStaffAuth();
  const [signingOut, setSigningOut] = useState(false);
  const { count: unreadNotifications } = useUnreadNotificationCount();
  const pendingApprovals = useTotalPendingApprovals();

  const provider = isProvider(user);

  // Annotated as MenuGroup[] rather than inferred: without it the `icon`
  // string literals widen to `string` and IconName's compile-time guarantee —
  // the whole point of that type — is lost.
  const providerGroups: MenuGroup[] = [
    {
      title: "التواصل",
      items: [
        { label: "الإشعارات", href: "/notifications", icon: "notifications", badge: unreadNotifications },
      ],
    },
    {
      title: "إدارة النشاط",
      items: [
        { label: "قائمة الأسعار", href: "/offerings", icon: "sell" },
        { label: "خصومات الباقات", href: "/bundle-rules", icon: "discount" },
        { label: "معرض الأعمال", href: "/projects", icon: "photo_library" },
        { label: "التوفر وفترات الانشغال", href: "/availability", icon: "event_busy" },
        { label: "قائمة الانتظار", href: "/waitlist", icon: "hourglass_top" },
      ],
    },
    {
      title: "الأدوات",
      items: [{ label: "التحليلات", href: "/analytics", icon: "bar_chart" }],
    },
    {
      title: "الحساب",
      items: [
        { label: "بيانات الشركة", href: "/profile", icon: "business" },
        { label: "الأجهزة والجلسات", href: "/sessions", icon: "devices" },
      ],
    },
  ];

  const adminGroups: MenuGroup[] = [
    {
      title: "التواصل",
      items: [
        { label: "الإشعارات", href: "/notifications", icon: "notifications", badge: unreadNotifications },
      ],
    },
    {
      title: "إدارة المنصة",
      items: [
        { label: "التصنيفات", href: "/categories", icon: "category" },
        { label: "الفريق", href: "/team", icon: "group" },
        { label: "قائمة الانتظار (كل الشركات)", href: "/platform-waitlist", icon: "hourglass_top" },
      ],
    },
    {
      title: "الأدوات",
      items: [
        { label: "التحليلات", href: "/analytics", icon: "bar_chart" },
        { label: "بحث شامل", href: "/search", icon: "search" },
        // Only for an admin holding at least one desktop grant — the hub
        // itself filters the modules further (see control/index.tsx).
        ...(hasAnyDesktopPermission(user)
          ? [{ label: "لوحة التحكم", href: "/control", icon: "space_dashboard" } as MenuItem]
          : []),
        { label: "سجل الإجراءات", href: "/audit-log", icon: "history" },
      ],
    },
    {
      title: "المحتوى",
      items: [
        { label: "الصفحات القانونية", href: "/content/pages", icon: "description" },
        { label: "قوالب البريد الإلكتروني", href: "/content/email-templates", icon: "mail" },
      ],
    },
    {
      title: "النظام",
      items: [
        { label: "إعدادات المنصة", href: "/settings", icon: "settings" },
        { label: "الأجهزة والجلسات", href: "/sessions", icon: "devices" },
      ],
    },
  ];

  const groups = (provider ? providerGroups : adminGroups).filter((g) => g.items.length > 0);

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await signOut();
      // No navigation call needed: signOut() clears useStaffAuth().user, which
      // makes app/index.tsx's <Redirect> to /sign-in fire on the next render.
    } catch {
      // signOut() clears local state on a best-effort basis even when the
      // server call fails — nothing to do but stop the spinner.
      setSigningOut(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScreenHeader title="المزيد" />
      <ScrollView contentContainerStyle={styles.body}>
        {/* Identity first: whose account this is, and what it can do. Compact
            on purpose — a full-bleed profile header would push the actual
            navigation below the fold. */}
        <View style={styles.card}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{user?.name?.trim().charAt(0) || "?"}</Text>
          </View>
          <View style={styles.identity}>
            <Text style={styles.name} numberOfLines={1}>{user?.name}</Text>
            <Text style={styles.email} numberOfLines={1}>{user?.email}</Text>
            <Text style={styles.role}>{user?.role === "ADMIN" ? "أدمن" : "مقدّم خدمة"}</Text>
          </View>
          {!provider && pendingApprovals > 0 ? (
            <Pressable
              style={styles.pendingPill}
              onPress={() => router.push("/(admin)/approvals" as never)}
              accessibilityRole="button"
              accessibilityLabel={`موافقات معلّقة: ${pendingApprovals}`}
            >
              <Text style={styles.pendingText}>{pendingApprovals > 99 ? "99+" : pendingApprovals}</Text>
              <Text style={styles.pendingLabel}>معلّق</Text>
            </Pressable>
          ) : null}
        </View>

        {groups.map((group) => (
          <View key={group.title} style={styles.group}>
            <Text style={styles.groupTitle}>{group.title}</Text>
            <View style={styles.groupCard}>
              {group.items.map((item, i) => (
                <Pressable
                  key={item.href}
                  style={({ pressed }) => [
                    styles.menuItem,
                    i === group.items.length - 1 && styles.menuItemLast,
                    pressed && styles.menuItemPressed,
                  ]}
                  onPress={() => router.push(item.href as never)}
                  accessibilityRole="button"
                  accessibilityLabel={
                    item.badge ? `${item.label}، ${item.badge} جديد` : item.label
                  }
                >
                  <Icon name={item.icon} size={20} color={colors.onSurfaceVariant} />
                  <Text style={styles.menuLabel}>{item.label}</Text>
                  {item.badge ? (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{item.badge > 99 ? "99+" : item.badge}</Text>
                    </View>
                  ) : null}
                  <Text style={styles.chevron}>‹</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ))}

        <Button
          label="تسجيل الخروج"
          variant="danger"
          onPress={handleSignOut}
          busy={signingOut}
          style={styles.signOut}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  body: { padding: 20, gap: 18, paddingBottom: 40 },

  card: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 14,
    backgroundColor: colors.surfaceContainer,
    borderRadius: 16,
    padding: 16,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontSize: type.subhead.fontSize,
    fontFamily: "Alexandria_700Bold",
    color: colors.onPrimary,
    textAlign: "center",
  },
  identity: { flex: 1, gap: 1 },
  name: { fontSize: type.subhead.fontSize, fontFamily: "Alexandria_700Bold", color: colors.onSurface, textAlign: textStart },
  email: { fontSize: type.caption.fontSize, fontFamily: "Cairo_400Regular", color: colors.onSurfaceVariant, textAlign: textStart },
  role: { fontSize: type.caption.fontSize, fontFamily: "Cairo_600SemiBold", color: colors.primary, marginTop: 2, textAlign: textStart },
  pendingPill: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minWidth: 52,
  },
  pendingText: { fontSize: type.subhead.fontSize, fontFamily: "Alexandria_700Bold", color: colors.primary },
  pendingLabel: { fontSize: 10, fontFamily: "Cairo_600SemiBold", color: colors.onSurfaceVariant },

  group: { gap: 8 },
  groupTitle: {
    fontSize: type.caption.fontSize,
    fontFamily: "Cairo_700Bold",
    color: colors.onSurfaceVariant,
    textAlign: textStart,
    paddingHorizontal: 4,
  },
  groupCard: {
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: colors.surface,
  },
  menuItem: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 12,
    // 52px total — comfortably past the 44px minimum touch target.
    paddingVertical: 15,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.outlineVariant,
  },
  menuItemLast: { borderBottomWidth: 0 },
  menuItemPressed: { backgroundColor: colors.surfaceContainerHigh },
  menuLabel: {
    flex: 1,
    fontSize: type.body.fontSize,
    fontFamily: "Cairo_600SemiBold",
    color: colors.onSurface,
    textAlign: textStart,
  },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    backgroundColor: colors.error,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { fontSize: type.caption.fontSize, fontFamily: "Cairo_700Bold", color: colors.onError },
  chevron: { fontSize: type.subhead.fontSize, color: colors.outline },

  signOut: { marginTop: 6 },
});
