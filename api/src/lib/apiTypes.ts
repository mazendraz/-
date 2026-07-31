/**
 * Canonical API contract shapes — mirrors app/src/lib/apiTypes.ts on the frontend.
 * Keep these two files in sync; they are the source of truth for request/response
 * payloads. Services return these shapes; routes serialize Prisma rows into them.
 */

// ── Shared ────────────────────────────────────────────────────────────────────

/** Generic paginated response envelope (lists). */
export interface ApiPage<T> {
  data: T[];
  meta: { total: number; page: number; pageSize: number };
}

/** Standard error body (flat — the client reads `.message` from the root). */
export interface ApiErrorBody {
  code: string;
  message: string;
  details?: Record<string, string[]>;
}

// ── Companies ─────────────────────────────────────────────────────────────────

export type ApiProjectStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface ApiProject {
  // Present on admin/provider payloads (per-project management); omitted on the
  // public profile, which only ever returns APPROVED projects.
  id?: string;
  title: string;
  img: string;
  description: string;
  year: string;
  featured?: boolean; // curated for the homepage showcase
  // Moderation state — surfaced to admin/provider so they can see/manage approval.
  status?: ApiProjectStatus;
}

/** GET /api/projects/featured — flattened showcase items for the homepage. */
export interface ApiFeaturedProject {
  title: string;
  img: string;
  company: string; // owning company name
  category: string; // owning company's category label
}

export interface ApiReview {
  id?: string; // present on admin payloads (per-review management); omitted publicly
  author: string;
  avatar: string; // initial letter used as fallback
  rating: number;
  text: string;
  date: string;
  district: string;
  verified: boolean; // true = real customer on a completed lead; false = curated
}

/** POST /reviews — public, customer-submitted review for a completed lead. */
export interface ApiReviewSubmitPayload {
  ref: string; // lead reference number
  phone: string; // must match the lead's phone (shared secret)
  rating: number; // 1..5
  text: string;
}

export interface ApiCompany {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  about: string;
  logo: string;
  cover: string;
  category: string;
  categoryLabel: string;
  services: string[];
  rating: number;
  reviewCount: number;
  completedProjects: number;
  gallery: string[];
  projects: ApiProject[];
  reviews: ApiReview[];
  // Published + active offerings only (see companies.service publicCompanyInclude).
  // Empty on card/list endpoints, which do not load the relation.
  offerings: ApiOffering[];
  /**
   * Published + active package discounts. Present on the public profile so the
   * live estimate can apply the SAME discount the server applies when the request
   * is priced — without it the on-screen total read higher than what was recorded
   * on the lead. Empty on card/list endpoints, which do not load the relation.
   */
  bundleRules?: ApiBundleRule[];
  phone: string;
  location: string;
  yearsExperience: number;
  responseTime: string;
  verifiedSince: string;
  badges: string[];
  featured: boolean;
  verified: boolean;
  // Availability. `busy` is the EFFECTIVE state (already resolved against busyUntil
  // server-side, so a passed busyUntil reads as available). busyUntil is the optional
  // auto-reopen instant (epoch ms; null = busy indefinitely). busyNote is an optional
  // customer-facing reason. When busy, the public profile swaps its request CTA for
  // the waiting-list CTA.
  busy: boolean;
  busyUntil?: number | null;
  busyNote?: string | null;
  // ── Feature F: scheduled busy windows ──
  // All derived at read time from the manual switch + any scheduled window; no
  // cron, so they are correct the instant a period starts or ends.
  /** When the current unavailability ends. null = open-ended, or not busy. */
  nextAvailableAt?: number | null;
  /** Start of the soonest period that has not begun — "busy from 5 Aug". */
  upcomingBusyFrom?: number | null;
  /** Customer-facing reason for the current unavailability. */
  busyReason?: string | null;
  /**
   * Exact lead count for this company. Admin list payloads only — absent
   * elsewhere. Present because deriving it in the browser from the hydrated
   * lead list (one capped page) under-reported on every card past 100 leads.
   */
  leadCount?: number;
  // Optional per-page SEO overrides; null/absent → frontend uses defaults.
  metaTitle?: string | null;
  metaDescription?: string | null;
  // Internal contact fields — lead notifications are sent here. Returned ONLY in
  // admin payloads (so the editor can round-trip them); omitted from public ones.
  email?: string | null;
  whatsapp?: string | null;
  // Admin-only: true when rating/reviewCount were set manually (not derived from
  // the Review table). Present only in admin payloads.
  ratingOverridden?: boolean;
}

// ── Availability + waiting list ─────────────────────────────────────────────────

/** PATCH /provider/availability · PATCH /admin/companies/:id/availability body. */
export interface ApiAvailabilityPayload {
  busy: boolean;
  busyUntil?: number | null; // epoch ms, or null to clear the auto-reopen date
  busyNote?: string | null;
}

export type ApiWaitlistStatus = "WAITING" | "NOTIFIED" | "CONVERTED" | "CANCELLED";

export interface ApiWaitlistEntry {
  id: string;
  companyId: string;
  companySlug: string;
  companyName: string;
  name: string;
  phone: string;
  service: string | null;
  note: string | null;
  status: ApiWaitlistStatus;
  createdAt: number; // epoch ms
}

/** POST /companies/:slug/waitlist — public join body. */
export interface ApiWaitlistPayload {
  name: string;
  phone: string;
  service?: string;
  note?: string;
}

/** PATCH /provider/waitlist/:id · /admin/companies/:id/waitlist/:entryId body. */
export interface ApiWaitlistStatusPatch {
  status: ApiWaitlistStatus;
}

// ── Categories ────────────────────────────────────────────────────────────────

export interface ApiCategory {
  slug: string;
  label: string;
  description: string;
  icon: string;
  cover: string;
  count: number;
  // Optional per-page SEO overrides; null/absent → frontend uses defaults.
  metaTitle?: string | null;
  metaDescription?: string | null;
}

/**
 * Admin view of a category. Adds `id` (needed to address PUT/DELETE
 * /admin/categories/[id] and to set a company's categoryId) and `isActive`.
 * The public ApiCategory deliberately omits both.
 */
export interface ApiAdminCategory extends ApiCategory {
  id: string;
  isActive: boolean;
}

// ── Leads (service requests) ──────────────────────────────────────────────────

export type ApiLeadStatus =
  | "New"
  | "Contacted"
  | "In Progress"
  | "Completed"
  | "Cancelled";

export interface ApiLead {
  id: string;
  refNumber: string;
  companySlug: string;
  companyName: string;
  service: string;
  name: string;
  phone: string;
  district: string;
  budget: string;
  description: string;
  status: ApiLeadStatus;
  reviewed: boolean; // true once the customer has left a review for this lead
  // High-entropy secret for public tracking/review — returned ONLY on creation
  // (stored client-side), never in admin/provider list payloads.
  trackingToken?: string;
  createdAt: number; // epoch ms
  // ── Feature C: multi-item requests ──
  // Empty for the classic single-service request. Every price below is a SNAPSHOT
  // from submission time and is never recomputed — a later price change must not
  // rewrite what this customer was quoted.
  items?: ApiLeadItem[];
  estimatedMin?: number | null;
  estimatedMax?: number | null;
  discountPercent?: number;
  /** At least one line is quoted on site, so the estimate is not the whole job. */
  hasOnInspection?: boolean;
}

/** One line of a multi-item request. */
export interface ApiLeadItem {
  id: string;
  /** Null once the offering is deleted; nameSnapshot keeps the line readable. */
  offeringId: string | null;
  nameSnapshot: string;
  tierLabel: string | null;
  qty: number;
  pricingModel: "FIXED" | "RANGE" | "PER_UNIT" | "ON_INSPECTION";
  unitPriceMin: number | null;
  unitPriceMax: number | null;
  lineMin: number | null;
  lineMax: number | null;
}

/** POST /leads — body shape */
export interface ApiLeadPayload {
  companySlug: string;
  companyName: string;
  service: string;
  name: string;
  phone: string;
  district: string;
  budget: string;
  description: string;
  /** Feature C. Omit for a single-service request. Prices are NEVER sent by the
   *  client — the server reads them from the catalogue. */
  items?: { offeringId: string; qty?: number; tierId?: string | null }[];
}

/** PATCH /leads/:id — body shape */
export interface ApiLeadStatusPatch {
  status: ApiLeadStatus;
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export type ApiUserRole = "ADMIN" | "PROVIDER";

export interface ApiUser {
  id: string;
  name: string;
  email: string;
  role: ApiUserRole;
  companyId: string | null;
}

/** POST /auth/login — body shape */
export interface ApiLoginPayload {
  email: string;
  password: string;
}

/** POST /auth/login — response (token stored in localStorage as al-assema-token) */
export interface ApiAuthResponse {
  token: string;
  user: ApiUser;
}

// ── Admin: user management ──────────────────────────────────────────────────
// Admin-only views/payloads for managing login accounts (ADMIN + PROVIDER).
// passwordHash is NEVER serialized into any of these shapes.

export interface ApiAdminUser {
  id: string;
  name: string;
  email: string;
  role: ApiUserRole;
  companyId: string | null;
  companyName: string | null; // resolved from the linked company, for display
  isActive: boolean;
  createdAt: number; // epoch ms
}

/** POST /admin/users — create an account (defaults to PROVIDER). */
export interface ApiAdminUserCreatePayload {
  name: string;
  email: string;
  password: string;
  role?: ApiUserRole;
  companyId?: string | null;
}

/** PATCH /admin/users/:id — partial update (any subset). */
export interface ApiAdminUserUpdatePayload {
  name?: string;
  password?: string; // reset password
  role?: ApiUserRole;
  companyId?: string | null; // null unlinks from the company
  isActive?: boolean; // false = revoke access (also kills active sessions)
}

// ── Site reviews (platform testimonials) ──────────────────────────────────────

export interface ApiSiteReview {
  id: string;
  name: string;
  district: string;
  rating: number;
  text: string;
  visible: boolean;
  createdAt: number; // epoch ms
}

/** POST /site-reviews — public submit body */
export interface ApiSiteReviewPayload {
  name: string;
  district: string;
  rating: number;
  text: string;
}

/** GET /site-reviews/settings · PUT /admin/site-reviews/settings */
export interface ApiSiteReviewSettings {
  enabled: boolean;
}

// ── Feedback (company "Report a problem" / suggestion / inquiry) ───────────────

export type ApiFeedbackType = "problem" | "suggestion" | "inquiry";

export interface ApiFeedback {
  id: string;
  companySlug: string;
  companyName: string;
  type: ApiFeedbackType;
  name: string | null;
  phone: string | null;
  message: string;
  isRead: boolean;
  createdAt: number; // epoch ms
}

/** POST /feedback — public submit body */
export interface ApiFeedbackPayload {
  companySlug: string;
  type: ApiFeedbackType;
  name?: string;
  phone?: string;
  message: string;
}

// ── Platform settings (admin-editable, public-facing) ──────────────────────────

/** GET /api/settings (public) · GET/PUT /api/admin/settings. Strings; "" = unset. */
export interface ApiPlatformSettings {
  site_name: string;
  support_email: string;
  public_phone: string;
  address: string;
  social_facebook: string;
  social_instagram: string;
  social_twitter: string;
  social_linkedin: string;
  // Newline-separated option lists for the request form; "" = use the built-in defaults.
  districts: string;
  budgets: string;
  // Homepage hero copy per locale; "" = localized defaults.
  hero_title_en: string;
  hero_title_ar: string;
  hero_subtitle_en: string;
  hero_subtitle_ar: string;
  // Branding image URLs; "" = built-in /logo.png + favicon.
  logo_url: string;
  favicon_url: string;
  // Logo size as a percentage (50–200) of the built-in size; "" = 100%.
  logo_scale: string;
  // Homepage hero background image URL; "" = the built-in skyline render.
  hero_image_url: string;
}

// ── Email templates (admin-only) ───────────────────────────────────────────────

/** GET/PUT /api/admin/email-templates. Blank field = built-in default. Tokens:
 *  {{company}} {{refNumber}} {{service}} {{customer}} {{phone}} {{district}}
 *  {{budget}} {{details}} {{receivedAt}}. */
export interface ApiEmailTemplates {
  providerSubject: string;
  providerBody: string;
  adminSubject: string;
  adminBody: string;
}

// ── Legal pages (Terms / Privacy) ───────────────────────────────────────────────

/** GET /api/pages (public) · GET/PUT /api/admin/pages. Plain text; "" = unpublished. */
export interface ApiLegalPages {
  terms: string;
  privacy: string;
}

// ── Maintenance / site status ──────────────────────────────────────────────────

/**
 * GET /api/status (public, `no-store`) · GET/PUT /api/admin/maintenance.
 *
 * Deliberately NOT part of ApiPlatformSettings: /api/settings is served with
 * `okCached()` (max-age=30, s-maxage=60, stale-while-revalidate=300), so flipping
 * maintenance through that payload could take up to five minutes to reach users.
 * This is the single source of truth for maintenance state — never duplicate it.
 *
 * `enabled` is the only field the gate reads; the rest is presentation.
 * Blank title/message = the frontend's localized defaults.
 */
export interface ApiMaintenanceStatus {
  enabled: boolean;
  title_en: string;
  title_ar: string;
  message_en: string;
  message_ar: string;
  /** Epoch ms for the "back in ..." countdown; null = no ETA shown. */
  eta: number | null;
}

// ── Admin notification preferences ─────────────────────────────────────────────

/**
 * GET/PUT /api/admin/notification-settings. Admin-only, and deliberately scoped
 * to chat: leads must always reach an admin, so there is no toggle for those —
 * only the chat channel (which fires on every customer message, far more often
 * than a new lead) has a mute switch. Providers get no equivalent — they asked
 * to keep every notification.
 */
export interface ApiAdminNotificationSettings {
  chatEnabled: boolean;
}

// ── Audit log (admin-only) ─────────────────────────────────────────────────────

// ── Lead statistics (dashboard aggregates) ─────────────────────────────────────

/**
 * GET /api/admin/stats (all companies) · GET /api/provider/stats (own company).
 *
 * Aggregates computed over the WHOLE lead table, not a page of it. The dashboards
 * previously derived these in the browser from a 100-row hydration, so every
 * total, percentage and chart silently stopped being true past 100 leads.
 *
 * Counts only — no lead rows — so the payload size is independent of table size.
 */
export interface ApiLeadStats {
  total: number;
  /** Every status present, explicitly 0 when none. */
  byStatus: Record<ApiLeadStatus, number>;
  /** Dense daily series ending today; `date` is "YYYY-MM-DD" in `timezone`. */
  perDay: { date: string; count: number }[];
  /** Dense monthly series ending this month; `date` is "YYYY-MM". */
  perMonth: { date: string; count: number }[];
  /** Top companies by volume. Admin only — empty on the provider endpoint. */
  byCompany: {
    companyId: string;
    companySlug: string;
    companyName: string;
    logo: string;
    rating: number;
    leads: number;
    completed: number;
    /** Percent, already rounded. */
    conversion: number;
  }[];
  /** Trailing window against the equal window before it, for the KPI delta. */
  recent: { days: number; current: number; previous: number };
  /**
   * Catalog totals for the admin KPI row. Admin only — absent on the provider
   * endpoint. Counted here because the admin company cache is a clamped page
   * (pageSize=200 → 100), so its length is not a count past a hundred companies.
   */
  catalog?: { companies: number; activeCompanies: number; categories: number };
  /** IANA zone the day/month buckets were resolved in. */
  timezone: string;
}

/** GET /admin/audit-logs → ApiPage<ApiAuditLog>. Append-only admin action trail. */
export interface ApiAuditLog {
  id: string;
  actorId: string;
  actorEmail: string;
  action: string; // dot-namespaced, e.g. "company.delete"
  entity: string;
  entityId: string;
  meta: Record<string, unknown> | null;
  createdAt: number; // epoch ms
}

// ── Offerings (Feature B) ──────────────────────────────────────────────────────

/** A quantity band on an offering: "one room" / "2-3 rooms". */
export interface ApiOfferingTier {
  id: string;
  label: string;
  qtyMin: number | null;
  qtyMax: number | null;
  priceMin: number | null;
  priceMax: number | null;
  sortOrder: number;
}

/**
 * A priced service or product. Prices are whole Egyptian pounds — no piastres,
 * and no currency field: every comparison in the product assumes one currency,
 * so the column would be dead weight until multi-currency is a real requirement.
 *
 * Only rows with isPublished && isActive appear on a public profile.
 */
export interface ApiOffering {
  id: string;
  companyId: string;
  name: string;
  description: string | null;
  kind: "SERVICE" | "PRODUCT";
  pricingModel: "FIXED" | "RANGE" | "PER_UNIT" | "ON_INSPECTION";
  priceMin: number | null;
  priceMax: number | null;
  unit: string | null;
  minQty: number | null;
  image: string | null;
  note: string | null;
  sortOrder: number;
  isActive: boolean;
  isPublished: boolean;
  /** Epoch ms of the last price change — drives "prices updated N days ago". */
  priceUpdatedAt: number | null;
  tiers: ApiOfferingTier[];
}

/** Package discount applied once a request reaches minItems items. */
export interface ApiBundleRule {
  id: string;
  companyId: string;
  label: string | null;
  minItems: number;
  discountPercent: number;
  isActive: boolean;
  isPublished: boolean;
}
