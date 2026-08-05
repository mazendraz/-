import type { StringKey } from "../../lib/i18n";

/**
 * The provider dashboard's tabs. A module of its own (mirroring
 * admin/nav.ts) so the layout, the sidebar and the `?tab=` back-compat
 * redirect all read the same list without importing each other.
 */
export type ProviderTab =
  | "overview" | "leads" | "messages" | "projects" | "pricing"
  | "reviews" | "analytics" | "availability" | "profile" | "settings";

export const PROVIDER_TABS: { id: ProviderTab; icon: string; labelKey: StringKey }[] = [
  { id: "overview", icon: "dashboard", labelKey: "prov_tab_overview" },
  { id: "leads", icon: "inbox", labelKey: "prov_tab_leads" },
  { id: "messages", icon: "forum", labelKey: "prov_tab_messages" },
  { id: "projects", icon: "photo_library", labelKey: "prov_tab_projects" },
  { id: "reviews", icon: "star", labelKey: "prov_tab_reviews" },
  { id: "analytics", icon: "bar_chart", labelKey: "prov_tab_analytics" },
  { id: "availability", icon: "event_busy", labelKey: "prov_tab_availability" },
  { id: "pricing", icon: "sell", labelKey: "prov_tab_pricing" },
  { id: "profile", icon: "business", labelKey: "prov_tab_profile" },
  { id: "settings", icon: "settings", labelKey: "prov_tab_settings" },
];

export function isProviderTab(v: string): v is ProviderTab {
  return PROVIDER_TABS.some((c) => c.id === v);
}
