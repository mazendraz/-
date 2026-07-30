// Tab identity + nav model. Lives in its own module so `index.tsx` and
// `components/SidebarBody.tsx` can both import it without a circular reference.
import type { StringKey } from "../../lib/i18n";
export type AdminTab =
  | "overview" | "leads" | "companies" | "services"
  | "team" | "reviews" | "changes" | "chat" | "status" | "settings";

export const NAV: { id: AdminTab; icon: string; labelKey: StringKey }[] = [
  { id: "overview", icon: "dashboard", labelKey: "admin_tab_overview" },
  { id: "leads", icon: "inbox", labelKey: "admin_tab_leads" },
  { id: "companies", icon: "business", labelKey: "admin_tab_companies" },
  { id: "services", icon: "category", labelKey: "admin_tab_services" },
  { id: "team", icon: "badge", labelKey: "admin_tab_team" },
  { id: "reviews", icon: "reviews", labelKey: "admin_tab_reviews" },
  { id: "changes", icon: "rate_review", labelKey: "admin_tab_changes" },
  { id: "chat", icon: "forum", labelKey: "admin_tab_chat" },
  { id: "status", icon: "monitor_heart", labelKey: "admin_tab_status" },
  { id: "settings", icon: "settings", labelKey: "admin_tab_settings" },
];
