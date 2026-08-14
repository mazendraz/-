// Sidebar structure — top-level groups match the mockups (executive_overview
// et al.) exactly: Overview, Operations, Business, Finance, Analytics,
// Reports, Settings, same order, same icons. The mockups render these as flat
// top-level links; the brief additionally specifies sub-items per group
// (Operations → Requests/Active Work/..., etc.), so each group with children
// expands inline rather than navigating directly — the top-level visual
// language (icon, label, active/hover states) is unchanged from the mockup.
import type { DesktopPermission } from "./permissions";

export interface NavLeaf {
  label: string;
  path: string;
  icon: string;
}

export interface NavGroup {
  label: string;
  icon: string;
  /** Permission gating the WHOLE group — hidden entirely without it. */
  permission: DesktopPermission;
  /** A bare group (Overview, Reports, Settings) navigates directly; a group
   *  with children expands to show them instead. */
  path?: string;
  children?: NavLeaf[];
}

export const NAV: NavGroup[] = [
  { label: "Overview", icon: "dashboard", permission: "overview:read", path: "/overview" },
  {
    label: "Operations",
    icon: "settings_applications",
    permission: "operations:read",
    children: [
      { label: "Requests", path: "/operations/requests", icon: "list_alt" },
      { label: "Active Work", path: "/operations/active-work", icon: "engineering" },
      { label: "Pending Actions", path: "/operations/pending-actions", icon: "pending_actions" },
      { label: "Price Verification", path: "/operations/price-verification", icon: "fact_check" },
      { label: "Price Discrepancies", path: "/operations/price-discrepancies", icon: "rule" },
    ],
  },
  {
    label: "Business",
    icon: "business_center",
    permission: "business:read",
    children: [
      { label: "Clients", path: "/business/clients", icon: "groups" },
      { label: "Providers", path: "/business/providers", icon: "storefront" },
      { label: "Services", path: "/business/services", icon: "home_repair_service" },
      { label: "Categories", path: "/business/categories", icon: "category" },
    ],
  },
  {
    label: "Finance",
    icon: "account_balance_wallet",
    permission: "finance:read",
    children: [
      { label: "Financial Overview", path: "/finance/overview", icon: "monitoring" },
      { label: "Income", path: "/finance/income", icon: "trending_up" },
      { label: "Expenses", path: "/finance/expenses", icon: "trending_down" },
      { label: "Transactions", path: "/finance/transactions", icon: "receipt_long" },
      { label: "Outstanding", path: "/finance/outstanding", icon: "hourglass_top" },
      { label: "Cash Flow", path: "/finance/cash-flow", icon: "swap_horiz" },
    ],
  },
  {
    label: "Analytics",
    icon: "analytics",
    permission: "analytics:read",
    children: [
      { label: "Business Performance", path: "/analytics/business-performance", icon: "insights" },
      { label: "Client Analytics", path: "/analytics/clients", icon: "person_search" },
      { label: "Provider Analytics", path: "/analytics/providers", icon: "workspace_premium" },
      { label: "Pricing Intelligence", path: "/analytics/pricing-intelligence", icon: "price_change" },
    ],
  },
  { label: "Reports", icon: "description", permission: "reports:read", path: "/reports" },
  { label: "Settings", icon: "settings", permission: "settings:write", path: "/settings" },
];
