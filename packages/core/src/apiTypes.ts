/**
 * The API contract: every request and response shape, in one place.
 *
 * This file used to live in `api/`, with a hand-maintained copy in `app/` and a
 * comment asking whoever edited one to remember the other. They drifted — the
 * API's `ApiLead` grew `reviewed`, `items`, `estimatedMin/Max`,
 * `discountPercent`, `hasOnInspection` and `completion`, and the frontend's copy
 * grew none of them, which is why `app/src/lib/requests.ts` ended up declaring a
 * THIRD version to fill the gaps.
 *
 * Now there is one definition and the others re-export it, so the copies cannot
 * disagree — the property matters more with two mobile apps arriving as the
 * third and fourth consumer.
 *
 * Services return these shapes; routes serialize Prisma rows into them; clients
 * parse them. Nothing here may import anything: it must compile in Next.js,
 * Vite and Metro alike.
 */

// ── Offering catalogue vocabulary ───────────────────────────────────────────
// Named unions, recovered from the frontend's copy during the core extraction.
// The API had the SAME unions written out inline at each use — identical values,
// no shared name — so nothing connected them and adding a member meant finding
// every literal. The three uses below now point here.
export type ApiOfferingKind = "SERVICE" | "PRODUCT";
export type ApiPricingModel = "FIXED" | "RANGE" | "PER_UNIT" | "ON_INSPECTION";
export type ApiPriceUnit =
  | "SQM" | "METER" | "PIECE" | "DOOR" | "WINDOW"
  | "ROOM" | "APARTMENT" | "HOUR" | "DAY" | "JOB";

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
  // A company may belong to MULTIPLE categories (see the CompanyCategory
  // junction). `category`/`categoryLabel`/`categoryPricingMode` are always the
  // company's PRIMARY category — the one every single-value display spot (card
  // badge, featured-project card, profile page, search result label) shows.
  category: string;
  categoryLabel: string;
  // Phase 9 — computed server-side from the company's PRIMARY category (see
  // companies.service.ts / serializeCompany) so the frontend never needs a
  // second call just to know whether this company may run a priced catalog.
  // NOTE: the actual Offerings gate (offerings.service assertCatalogEnabled) is a
  // permissive union over ALL of the company's categories, not just this one —
  // use `categories.some(c => c.pricingMode === "FIXED_CATALOG")` if you need
  // that exact check on the client.
  categoryPricingMode: ApiCategoryPricingMode;
  // Full category membership (admin/provider editors, or anything that needs
  // more than the primary). Exactly one entry has isPrimary: true.
  categories: { slug: string; label: string; pricingMode: ApiCategoryPricingMode; isPrimary: boolean }[];
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
  // Business Control Center only — Al Asima's commission % for this company.
  // null = falls back to the platform default (see finance.service.ts
  // resolveCommissionPercent). Present only in admin payloads.
  commissionPercent?: number | null;
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
  // Set once accepted (status CONVERTED) — the id of the Lead this entry became.
  // See waitlist.service.ts convertToLead. Null until then.
  convertedLeadId: string | null;
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

/**
 * Phase 9 — whether companies in this category may run a priced Offering
 * catalog. QUOTE_ONLY (the default for every category that predates this) means
 * no catalog: chips + a direct request, exactly like before this existed.
 * FIXED_CATALOG lets companies publish priced Offerings. See
 * offerings.service.ts (assertCatalogEnabled) for the actual enforcement —
 * this value alone is not what stops a write, it's just what the value means.
 */
export type ApiCategoryPricingMode = "QUOTE_ONLY" | "FIXED_CATALOG";

export interface ApiCategory {
  slug: string;
  label: string;
  description: string;
  icon: string;
  cover: string;
  count: number;
  pricingMode: ApiCategoryPricingMode;
  // Optional per-page SEO overrides; null/absent → frontend uses defaults.
  metaTitle?: string | null;
  metaDescription?: string | null;
  /**
   * How many companies would be affected by turning this category's pricing
   * catalog off. ADMIN payloads only — absent everywhere else, which is why it
   * is optional here and read with `?? 0` at the one call site (CategoryEditor).
   *
   * Also recovered from the frontend's copy during the core extraction.
   */
  publishedOfferingCompanyCount?: number;
}

/**
 * Admin view of a category. Adds `id` (needed to address PUT/DELETE
 * /admin/categories/[id] and to link a company to it via categoryIds) and
 * `isActive`.
 * The public ApiCategory deliberately omits both.
 */
export interface ApiAdminCategory extends ApiCategory {
  id: string;
  isActive: boolean;
  /**
   * How many of this category's companies have at least one PUBLISHED
   * Offering right now. The CategoryEditor confirm-warning when switching
   * FIXED_CATALOG → QUOTE_ONLY needs this number; computed once for the whole
   * admin list (categories.service.ts listAll) so opening the editor never
   * costs an extra round trip.
   */
  publishedOfferingCompanyCount: number;
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
  // Absent (not null) when the provider hasn't completed this lead yet — see
  // ApiLeadCompletion below.
  completion?: ApiLeadCompletion;
}

/** One line of a multi-item request. */
export interface ApiLeadItem {
  id: string;
  /** Null once the offering is deleted; nameSnapshot keeps the line readable. */
  offeringId: string | null;
  nameSnapshot: string;
  tierLabel: string | null;
  qty: number;
  pricingModel: ApiPricingModel;
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

// ── Lead completion + final price verification ─────────────────────────────────

export type ApiVerificationStatus = "PENDING" | "CONFIRMED" | "DISCREPANCY";

/**
 * Provider's "mark as completed" record, riding along on every ApiLead once the
 * provider has submitted it (see leadInclude in leads.service.ts) — there is no
 * separate GET endpoint for it. `finalTotal` is derived
 * (providerAmount + (additionalWorkAmount ?? 0)), never stored.
 */
export interface ApiLeadCompletion {
  providerAmount: number;
  additionalWorkDescription: string | null;
  additionalWorkAmount: number | null;
  notes: string | null;
  attachments: string[];
  finalTotal: number;
  submittedAt: number; // epoch ms
  verificationStatus: ApiVerificationStatus;
  clientAmount: number | null;
  discrepancyNote: string | null;
  verifiedAt: number | null; // epoch ms, null until the client responds
}

/** POST /provider/leads/:id/complete — body shape. */
export interface ApiLeadCompletionPayload {
  providerAmount: number;
  additionalWork: { description: string; amount: number } | null;
  notes?: string;
  attachments?: string[];
}

/**
 * POST /leads/verify — public, ref+token (or phone) gated, same trust model as
 * /leads/track and /reviews. clientAmount is required when decision is
 * "discrepancy" (enforced in validation, not just here).
 */
export interface ApiLeadVerificationPayload {
  ref: string;
  token?: string;
  phone?: string;
  decision: "confirmed" | "discrepancy";
  clientAmount?: number;
  note?: string;
}

/**
 * Business Control Center: the Operations screen's 5 KPI cards (Requests /
 * Active Work / Pending Actions / Price Verification / Price Discrepancies
 * all read this one snapshot, each highlighting a different field). A live
 * point-in-time count, not window-scoped — matches ApiDesktopOverview's
 * needsAttention block, which is the same kind of "what needs review right
 * now" signal.
 */
export interface ApiOperationsSummary {
  /** Lead.status === NEW — nobody has responded to this request yet. */
  pendingRequests: number;
  /** Lead.status === IN_PROGRESS. */
  activeServices: number;
  /** LeadCompletion.verificationStatus === PENDING — provider submitted a
   *  final amount, client hasn't confirmed or disputed it yet. */
  awaitingVerification: number;
  /** Open (unresolved) commission disputes — same definition as
   *  ApiDesktopOverview.needsAttention.discrepanciesRequiringReview
   *  (Transaction{type: COMMISSION_INCOME, status: DISPUTED}), so the two
   *  screens can never show different numbers for the same thing. */
  discrepancies: number;
  /** Lead.status in (NEW, CONTACTED) and still open after the follow-up
   *  window — see leads.service.ts's OVERDUE_FOLLOWUP_HOURS. There is no
   *  stored SLA/deadline field on Lead; this is a documented query threshold,
   *  not a fabricated backend state. */
  overdueFollowUps: number;
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export type ApiUserRole = "ADMIN" | "PROVIDER";

export interface ApiUser {
  id: string;
  name: string;
  email: string;
  role: ApiUserRole;
  companyId: string | null;
  // Business Control Center (desktop app) access grants — see
  // withPermission.ts DesktopPermission. Always present (possibly empty).
  desktopPermissions: string[];
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

// ── Customer accounts (mobile apps + website) ───────────────────────────────
// A CUSTOMER, not a staff ApiUser: no role, no companyId, no permissions. The
// two never appear in the same response and are never interchangeable.

/** The signed-in customer, as returned to the client. */
export interface ApiCustomer {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  /** The identity provider's assertion, surfaced so the UI can explain a refusal. */
  emailVerified: boolean;
}

/** POST /auth/google — response. */
export interface ApiCustomerAuthResponse {
  token: string;
  /**
   * Long-lived refresh token — present ONLY when the client sent `device` at
   * sign-in, i.e. a mobile app. Store it in the platform keystore and exchange
   * it at /auth/customer/refresh when `token` expires.
   *
   * Absent for the website on purpose: it has an httpOnly cookie JavaScript
   * cannot read, and a 60-day credential in localStorage would be a downgrade.
   */
  refreshToken?: string;
  customer: ApiCustomer;
  /**
   * What this sign-in did:
   *   "created"   — brand-new account, so the app can show onboarding and offer
   *                 to attach past requests.
   *   "linked"    — a second provider joined an existing account.
   *   "returning" — ordinary sign-in.
   * The app branches its first screen on this rather than guessing from whether
   * the request list came back empty.
   */
  outcome: "created" | "linked" | "returning";
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
  // Business Control Center (desktop app) access grants — managed from the
  // existing Team tab (pages/admin/TeamTab.tsx), no separate screen.
  desktopPermissions: string[];
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
  desktopPermissions?: string[]; // Business Control Center access grants
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
  /**
   * False = a draft band awaiting publish approval. A tier price overrides the
   * offering's for the line it matches, so a band added to an already-published
   * offering is a new PUBLIC price and is held for review — never false in a
   * public payload, which filters on isPublished.
   *
   * Recovered from the frontend's copy during the core extraction: the
   * serializer has always emitted it (offerings.service.ts), this declaration
   * had simply never been updated to say so.
   */
  isPublished: boolean;
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
  kind: ApiOfferingKind;
  pricingModel: ApiPricingModel;
  priceMin: number | null;
  priceMax: number | null;
  /**
   * Constrained to the union, not `string`: the value comes from a Prisma enum,
   * so a free-form string was never reachable. The frontend's copy already had
   * it right — this is the API's copy catching up during the core extraction.
   */
  unit: ApiPriceUnit | null;
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

// ── Business Control Center (desktop app): Clients ──────────────────────────
// Client is a phone-deduplicated aggregation of Leads — NOT a customer login.
// See schema.prisma's Client model comment.

export interface ApiClient {
  id: string;
  phone: string;
  name: string;
  firstSeenAt: number; // epoch ms
  lastSeenAt: number; // epoch ms
  totalRequests: number;
  successfulServices: number; // leads with a CONFIRMED/resolved-DISCREPANCY completion
  /** Sum of verified final amounts (LeadCompletion.clientAmount) across this
   *  client's completed+verified leads, EGP. Gross service value, not Al
   *  Asima's commission — see ApiFinanceOverview for the revenue-side number. */
  totalValue: number;
  /** Heuristic v1: ACTIVE if lastSeenAt is within the last 90 days, else
   *  DORMANT. No "REVIEW" state yet — that would need a real signal (open
   *  dispute, complaint) this endpoint doesn't have. */
  status: "ACTIVE" | "DORMANT";
}

export interface ApiClientListQuery {
  page?: number;
  pageSize?: number;
  search?: string; // matches name or phone
}

/** GET /admin/clients/overview — the KPI row + funnel for the Clients & CRM screen. */
export interface ApiClientOverview {
  totalClients: number;
  newClients: { current: number; previous: number }; // trailing window, see StatsQuery.deltaDays
  /** Clients active this window who were already clients before it — i.e.
   *  everyone in the current window's active set who ISN'T newClients.current. */
  returningClients: number;
  /** Share of clients active in BOTH the previous and current window — the
   *  simplest defensible reading of "retention" from lead timestamps alone. */
  retentionRatePercent: number;
  avgLifetimeValue: number; // EGP, mean of ApiClient.totalValue across all clients
  /** All-time average Lead count per Client — not windowed. */
  avgRequestsPerClient: number;
  /** All-time count of verified completions tied to a known client. */
  completedServicesTotal: number;
}

// ── Business Control Center (desktop app): Finance ──────────────────────────

export type ApiTransactionType = "COMMISSION_INCOME" | "EXPENSE" | "ADJUSTMENT";
export type ApiTransactionStatus = "PENDING" | "DISPUTED" | "COLLECTED" | "VOID";
export type ApiFinancialAccountType = "CASH" | "BANK" | "PROVIDER_PAYABLE";

export interface ApiFinancialAccount {
  id: string;
  name: string;
  type: ApiFinancialAccountType;
  isActive: boolean;
}

export interface ApiFinancialAccountPayload {
  name: string;
  type: ApiFinancialAccountType;
}

export interface ApiTransactionCategory {
  id: string;
  name: string;
  kind: ApiTransactionType;
  isActive: boolean;
}

export interface ApiTransactionCategoryPayload {
  name: string;
  kind: ApiTransactionType;
}

export interface ApiTransaction {
  id: string;
  type: ApiTransactionType;
  status: ApiTransactionStatus;
  amount: number; // EGP
  accountId: string | null;
  accountName: string | null;
  categoryId: string | null;
  categoryName: string | null;
  leadId: string | null;
  leadRefNumber: string | null;
  companyId: string | null;
  companyName: string | null;
  note: string | null;
  attachments: string[];
  occurredAt: number; // epoch ms
  createdById: string | null;
  createdAt: number; // epoch ms
}

/** POST /admin/finance/transactions — manual EXPENSE or ADJUSTMENT entry.
 *  COMMISSION_INCOME rows are ONLY ever created by the system (see
 *  leadCompletion.service.verify → finance.service.recognizeCommission) —
 *  never via this endpoint, so revenue can never be hand-entered as a
 *  workaround to the confirmed recognition rule. */
export interface ApiTransactionCreatePayload {
  type: "EXPENSE" | "ADJUSTMENT";
  amount: number;
  accountId?: string | null;
  categoryId?: string | null;
  companyId?: string | null;
  note?: string;
  attachments?: string[];
  occurredAt?: number; // epoch ms; defaults to now
}

/** PATCH /admin/finance/transactions/:id — status transition only. */
export interface ApiTransactionStatusPatch {
  status: ApiTransactionStatus;
}

export interface ApiTransactionListQuery {
  page?: number;
  pageSize?: number;
  type?: ApiTransactionType;
  status?: ApiTransactionStatus;
  categoryId?: string;
  companyId?: string;
  accountId?: string;
  /** Free-text match against note, provider (company) name, and lead
   *  refNumber — backs the Income/Expenses/Transactions search boxes.
   *  Server-side only (see finance.service.ts's listTransactions); the
   *  desktop app never downloads the ledger to filter it locally. */
  search?: string;
  from?: number; // epoch ms
  to?: number; // epoch ms
}

/** GET /admin/finance/overview → the Finance Overview screen's KPI row. */
export interface ApiFinanceOverview {
  /** Sum of verified final amounts (LeadCompletion.clientAmount) for leads
   *  verified in range — "Total Service Value Processed". Gross, not
   *  Al Asima's cut. */
  serviceValueProcessed: number;
  /** Sum of COMMISSION_INCOME transactions in range, excluding VOID —
   *  "Al Asima Recognized Revenue" (accrual: includes PENDING + DISPUTED + COLLECTED). */
  recognizedRevenue: number;
  collectedRevenue: number; // COMMISSION_INCOME, status=COLLECTED
  outstandingRevenue: number; // COMMISSION_INCOME, status=PENDING
  disputedRevenue: number; // COMMISSION_INCOME, status=DISPUTED — needs admin resolution
  totalExpenses: number; // EXPENSE, excluding VOID
  /** recognizedRevenue - totalExpenses (accrual-basis). */
  netIncome: number;
  /** SUM(COLLECTED COMMISSION_INCOME) - SUM(COLLECTED EXPENSE) - cash that has
   *  actually moved, across all FinancialAccounts. */
  cashPosition: number;
  commissionPipeline: { expected: number; collected: number };
  /**
   * % change vs. the immediately-preceding window of the same length (e.g.
   * "last 30 days" compares against the 30 days before that) — matches the
   * "+X% vs last month" the financial_command_center_2 mockup shows on every
   * KPI card. null when `from` wasn't provided (no window to compare
   * against), and any individual field is null when its own previous-period
   * value was zero (see percentChange's doc comment in finance.service.ts —
   * "undefined" is the honest answer against a zero base, not +∞% or +100%).
   */
  trend: {
    serviceValueProcessedPercent: number | null;
    recognizedRevenuePercent: number | null;
    collectedRevenuePercent: number | null;
    outstandingRevenuePercent: number | null;
    disputedRevenuePercent: number | null;
    totalExpensesPercent: number | null;
    netIncomePercent: number | null;
    cashPositionPercent: number | null;
  } | null;
}

export interface ApiFinanceQuery {
  from?: number; // epoch ms
  to?: number; // epoch ms
}

/** GET /admin/finance/cash-flow → the Cash Flow screen. `days` mirrors
 *  DesktopOverviewQuery's trailing-window convention (this screen reads the
 *  same Header Today/This Week/This Month/Custom tabs as Overview — see
 *  desktop's usePeriod()), not an arbitrary calendar range. */
export interface ApiCashFlowQuery {
  days?: number;
}

export interface ApiCashFlowPoint {
  /** "YYYY-MM-DD" (or "YYYY-MM-DDTHH" for the 1-day window) in the server's
   *  local time zone — same bucketing convention as
   *  ApiDesktopOverview.series. */
  date: string;
  moneyIn: number;
  moneyOut: number;
}

export interface ApiCashFlow {
  /** SUM(COMMISSION_INCOME, status=COLLECTED) within the selected window —
   *  cash that actually arrived, not merely recognized/pending. */
  moneyIn: number;
  /** SUM(EXPENSE, status=COLLECTED) within the selected window. */
  moneyOut: number;
  netCashFlow: number; // moneyIn - moneyOut, for the selected window
  /**
   * Running balance across ALL time (not reset by the selected window) —
   * SUM(COLLECTED COMMISSION_INCOME) - SUM(COLLECTED EXPENSE) since the
   * ledger began. Deliberately NOT the same number as
   * ApiFinanceOverview.cashPosition, which IS window-scoped (that field
   * answers "net cash movement in this period"; this one answers "what's
   * the balance right now") — see finance.service.ts's financeCashFlow.
   */
  cashBalance: number;
  /** Dense, oldest-first, one point per bucket — powers the trend chart. */
  series: ApiCashFlowPoint[];
}

// ── Business Control Center (desktop app): Pricing Intelligence ────────────
// Pure aggregation over Lead + LeadCompletion — zero new schema.

export interface ApiPricingIntelligence {
  avgEstimatedPrice: number;
  avgFinalPrice: number; // avg clientAmount across verified leads in range
  /** % of verified-in-range leads whose verificationStatus is/was DISCREPANCY. */
  priceDiscrepancyRatePercent: number;
  avgPriceIncrease: number; // mean of (clientAmount - estimate) where positive
  avgPriceDecrease: number; // mean of (clientAmount - estimate) where negative
  additionalWorkFrequencyPercent: number;
  additionalWorkInstances: number;
  /** Largest |finalTotal - estimate| seen across the matching rows, EGP. 0
   *  when no row in range has an estimate to compare against. */
  highestDifference: number;
  /** Total rows matching the filter (for "Showing X of Y" — variance itself is one page). */
  varianceTotal: number;
  variance: {
    leadId: string;
    refNumber: string;
    service: string;
    companyName: string;
    clientName: string;
    estimatedPrice: number | null;
    finalPrice: number; // clientAmount
    deltaPercent: number | null; // vs estimate, null if no estimate
    verificationStatus: "CONFIRMED" | "DISCREPANCY";
  }[];
}

export interface ApiPricingIntelligenceQuery {
  page?: number;
  pageSize?: number;
  from?: number;
  to?: number;
  companyId?: string;
}

// ── Business Control Center (desktop app): Pricing Analytics ───────────────
// The Analytics module's deeper pricing view — same underlying Lead +
// LeadCompletion aggregation as Pricing Intelligence, plus the breakdowns
// (trend over time, by category, by provider) that screen deliberately
// skipped as not worth a backend addition for a single KPI row. See
// pricingIntelligence.service.ts's pricingAnalytics().

export interface ApiPricingAnalyticsQuery {
  /** Trailing window in days — same usePeriod() convention as Overview/Finance. */
  days?: number;
}

export interface ApiPricingAnalyticsPoint {
  /** "YYYY-MM-DD" (weekly bucket start, server-local) — see the service for bucketing. */
  date: string;
  avgEstimated: number;
  avgProviderFinal: number;
  avgClientConfirmed: number;
}

export interface ApiPricingByCategory {
  category: string; // Category.label; "Uncategorized" if the provider has none
  avgDifferencePercent: number;
  count: number;
}

export interface ApiPricingByProvider {
  companyId: string;
  companyName: string;
  avgDifferencePercent: number;
  count: number;
}

export interface ApiPricingAnalytics {
  avgEstimatedPrice: number;
  /** Provider Final Price != Client Confirmed Price — the two are kept
   *  distinct here on purpose, per the platform's pricing business rule. */
  avgProviderFinalPrice: number;
  avgClientConfirmedPrice: number;
  avgDifference: number; // EGP, mean (clientConfirmed - estimate)
  avgDifferencePercent: number;
  additionalWorkFrequencyPercent: number;
  priceDiscrepancyRatePercent: number;
  /** Weekly buckets, oldest first, dense across the selected window. */
  trend: ApiPricingAnalyticsPoint[];
  /** By the provider's primary category, ordered by volume desc, capped to 20. */
  byCategory: ApiPricingByCategory[];
  /** Top 10 providers by volume in range. */
  byProvider: ApiPricingByProvider[];
}

// ── Business Control Center (desktop app): Provider Performance ────────────

export interface ApiProviderPerformance {
  companyId: string;
  companySlug: string;
  companyName: string;
  logo: string;
  categoryLabel: string;
  requestsHandled: number;
  completedServices: number;
  completionRatePercent: number;
  serviceValue: number; // sum of verified clientAmount for this company
  avgRating: number;
  discrepancyRatePercent: number;
  status: "ACTIVE" | "REVIEW"; // REVIEW when discrepancyRatePercent crosses a threshold
}

export interface ApiProviderPerformanceQuery {
  page?: number;
  pageSize?: number;
  from?: number;
  to?: number;
  category?: string;
  search?: string; // matches company name
}

/** GET /admin/providers-performance/summary — the Provider Performance
 *  screen's top KPI row, across ALL companies (not the current page). */
export interface ApiProviderPerformanceSummary {
  totalProviders: number;
  /** Company.status === ACTIVE (live on the marketplace right now). */
  activeProviders: number;
  completedServicesTotal: number;
  avgRating: number;
  discrepancyRatePercent: number;
}

// ── Business Control Center (desktop app): Overview ──────────────────────────

/** GET /admin/desktop/overview → the desktop Overview screen's combined payload. */
export interface ApiDesktopOverview {
  newClients: number;
  newRequests: number;
  completedServices: number;
  serviceValue: number;
  alAsimaRevenue: number;
  expenses: number;
  needsAttention: {
    discrepanciesRequiringReview: number;
    requestsAwaitingProviderResponse: number;
    outstandingCommissionCount: number;
  };
  /**
   * % change vs. the immediately-preceding window of the same length (e.g.
   * "This Week" compares to the week before it) — powers the mockup's KPI
   * trend badges (executive_overview/code.html). null when the previous
   * window was zero (percent change is undefined, not "0%" or "∞%") — the
   * desktop app renders "New" instead of a percentage in that case.
   */
  trend: {
    newClientsPercent: number | null;
    newRequestsPercent: number | null;
    completedServicesPercent: number | null;
    serviceValuePercent: number | null;
    alAsimaRevenuePercent: number | null;
    expensesPercent: number | null;
  };
  /**
   * Dense points across the selected window, oldest first, one per bucket
   * with no gaps — powers the "Service Value vs Al Asima Revenue" chart.
   * Hourly buckets ("YYYY-MM-DDTHH") when the window is 1 day (the "Today"
   * tab); daily buckets ("YYYY-MM-DD") otherwise, in the server's local time
   * zone. Not capped — a 365-day "Custom" window returns 365 points; the
   * desktop app is responsible for thinning x-axis labels, not the data.
   */
  series: { date: string; serviceValue: number; revenue: number }[];
  /**
   * Lead-status funnel for the window, using Lead.status directly — NOT the
   * mockup's pre-submission "Website Visitors" / "Requests Started" steps,
   * which would need session/analytics tracking this platform doesn't have
   * (a Lead is only created once a request is actually submitted; there is
   * no record of a visitor who started and abandoned the form). Flagged, not
   * faked — see desktopOverview.service.ts.
   */
  funnel: { submitted: number; contacted: number; inProgress: number; completed: number };
  /**
   * Most recent cross-entity events for the window, newest first, capped to
   * `limit` (see DesktopOverviewQuery). Merges four real signals — there is
   * no single activity-log table this reads from (AuditLog is admin-action-only).
   */
  recentActivity: {
    id: string;
    type: "new_request" | "service_completed" | "dispute_raised" | "commission_collected" | "new_client";
    label: string;
    occurredAt: number; // epoch ms
    amount: number | null; // EGP, when the event has one (null otherwise)
  }[];
}

// ── Business Control Center (desktop app): Reports Center ──────────────────
// Every report reuses an EXISTING service function's data (desktopOverview,
// financeCashFlow, listTransactions, clients.list, providerPerformance,
// pricingIntelligence) reshaped into a flat table — no parallel aggregation
// pipeline, per the "no duplicate systems" rule. Row count is capped to the
// same MAX_PAGE_SIZE each underlying list screen already uses (100) — see
// reports.service.ts's REPORT_ROW_CAP comment. `truncated` tells the caller
// when the report isn't the full data set, so the UI never claims a partial
// export is everything.

export type ApiReportType =
  | "business-overview"
  | "revenue"
  | "expenses"
  | "clients"
  | "providers"
  | "pricing"
  | "price-discrepancies"
  | "cash-flow";

export interface ApiReportQuery {
  type: ApiReportType;
  from?: number; // epoch ms
  to?: number; // epoch ms
}

export interface ApiReport {
  type: ApiReportType;
  title: string;
  description: string;
  generatedAt: number; // epoch ms
  columns: string[];
  rows: (string | number)[][];
  rowCount: number; // rows.length
  totalAvailable: number; // total matching rows before the report cap
  truncated: boolean; // true when totalAvailable > rowCount
  /** Ready-to-download CSV text of the same columns/rows — generated once,
   *  server-side, so preview and export are always the same data. */
  csv: string;
}

// ── Business Control Center (desktop app): Global Search ───────────────────
// One endpoint, capped to a handful of rows per category (this is a
// jump-to-record finder, not a reporting tool — Reports already covers full
// tables). Which categories run at all depends on the caller's OWN desktop
// permissions — a user without finance:read never sees a Transaction result,
// even if their search text happens to match one; see globalSearch.service.ts.

export type ApiSearchCategory = "client" | "provider" | "request" | "service" | "transaction";

export interface ApiSearchResult {
  category: ApiSearchCategory;
  id: string;
  title: string;
  subtitle: string;
  /** Desktop app route to navigate to on click. Points at the category's
   *  list screen (Clients, Providers, Requests, Business ▸ Services,
   *  Transactions) — deep-linking straight to one record's drawer would
   *  need a per-screen "open this id" URL contract none of those screens
   *  have yet, so this is scoped to "get you to the right list," not
   *  "open the exact row." */
  path: string;
}

export interface ApiSearchResponse {
  query: string;
  results: ApiSearchResult[];
}

// ── Business Control Center (desktop app): Notification Center ─────────────
// No Notification table exists — adding one needs a real migration
// (`prisma migrate dev`), which this environment cannot run (see
// admin/notifications/route.ts's doc comment). So this reuses the SAME
// merged real-events feed desktopOverview.service.ts's recentActivity()
// already computes for the Overview screen's activity list, permission-
// filtered the same way Search is. There is no persisted read/unread flag —
// the desktop app tracks "seen up to" as a local timestamp (see
// Header.tsx's NotificationBell), which is honest about what's real here:
// an activity feed, not a notification delivery system with server-side
// read receipts.

export type ApiNotificationType = "new_request" | "service_completed" | "dispute_raised" | "commission_collected" | "new_client";

export interface ApiNotification {
  id: string;
  type: ApiNotificationType;
  title: string;
  body: string;
  /** Desktop app route to navigate to on click — same "list screen, not the
   *  exact row" scoping as ApiSearchResult.path. */
  path: string;
  occurredAt: number; // epoch ms
}

export interface ApiNotificationsResponse {
  notifications: ApiNotification[];
}
