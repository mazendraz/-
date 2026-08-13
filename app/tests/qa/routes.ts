// Shared route table for the CTO QA sweep (tests/qa/).
// Kept separate from tests/ui-audit.spec.ts's list so the audit baselines
// stay untouched while this suite grows its own coverage (public pages the
// audit never listed: /about, /contact, and the provider completion flow).

export type Auth = "admin" | "provider" | undefined;

export const REAL_COMPANY_SLUG = "nextech-living";
export const REAL_CATEGORY_SLUG = "construction";

export const VIEWPORTS = [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1366, height: 900 },
] as const;

export const LOCALES = ["ar", "en"] as const;
export type Locale = (typeof LOCALES)[number];

export const ROUTES: { name: string; path: string; auth?: Auth }[] = [
  // ── Public ──
  { name: "home", path: "/" },
  { name: "services", path: "/services" },
  { name: "service-category", path: `/services/${REAL_CATEGORY_SLUG}` },
  { name: "companies", path: "/companies" },
  { name: "company-profile", path: `/companies/${REAL_COMPANY_SLUG}` },
  { name: "guided-start", path: "/start" },
  { name: "saved", path: "/saved" },
  { name: "my-requests", path: "/requests" },
  { name: "messages", path: "/messages" },
  { name: "request-form", path: "/request" },
  { name: "about", path: "/about" },
  { name: "contact", path: "/contact" },
  { name: "terms", path: "/terms" },
  { name: "privacy", path: "/privacy" },
  { name: "not-found", path: "/this-route-does-not-exist" },
  { name: "admin-login", path: "/admin" },

  // ── Admin ──
  { name: "admin-overview", path: "/admin/overview", auth: "admin" },
  { name: "admin-leads", path: "/admin/leads", auth: "admin" },
  { name: "admin-companies", path: "/admin/companies", auth: "admin" },
  { name: "admin-services", path: "/admin/services", auth: "admin" },
  { name: "admin-reviews", path: "/admin/reviews", auth: "admin" },
  { name: "admin-changes", path: "/admin/changes", auth: "admin" },
  { name: "admin-chat", path: "/admin/chat", auth: "admin" },
  { name: "admin-team", path: "/admin/team", auth: "admin" },
  { name: "admin-status", path: "/admin/status", auth: "admin" },
  { name: "admin-settings", path: "/admin/settings", auth: "admin" },

  // ── Provider ──
  { name: "provider-overview", path: "/provider/overview", auth: "provider" },
  { name: "provider-leads", path: "/provider/leads", auth: "provider" },
  { name: "provider-messages", path: "/provider/messages", auth: "provider" },
  { name: "provider-projects", path: "/provider/projects", auth: "provider" },
  { name: "provider-reviews", path: "/provider/reviews", auth: "provider" },
  { name: "provider-analytics", path: "/provider/analytics", auth: "provider" },
  { name: "provider-availability", path: "/provider/availability", auth: "provider" },
  { name: "provider-pricing", path: "/provider/pricing", auth: "provider" },
  { name: "provider-profile", path: "/provider/profile", auth: "provider" },
  { name: "provider-settings", path: "/provider/settings", auth: "provider" },
];
