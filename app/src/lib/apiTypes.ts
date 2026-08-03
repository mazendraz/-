/**
 * Canonical types describing the Al Assema backend API contract.
 *
 * Backend developers: implement endpoints that produce/consume these shapes.
 * Frontend developers: these mirror the local types in data.ts — keep them in sync.
 */

// ── Shared ────────────────────────────────────────────────────────────────────

/** Generic paginated response envelope */
export interface ApiPage<T> {
  data: T[];
  meta: { total: number; page: number; pageSize: number };
}

/**
 * Generic single-item response envelope.
 * NOTE: single resources are returned RAW (no envelope) — the live client does
 * `res.json() as T` directly (see api.ts / requests.ts). Kept only for callers
 * that explicitly opt into a wrapped shape; the default contract is raw.
 */
export interface ApiItem<T> {
  data: T;
}

/** Standard error body */
export interface ApiErrorBody {
  code: string;
  message: string;
  details?: Record<string, string[]>;
}

// ── Companies ─────────────────────────────────────────────────────────────────

export interface ApiProject {
  title: string;
  img: string;
  description: string;
  year: string;
}

export interface ApiReview {
  author: string;
  avatar: string; // initial letter used as fallback
  rating: number;
  text: string;
  date: string;
  district: string;
}

export interface ApiCompany {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  about: string;
  logo: string;
  cover: string;
  // A company may belong to MULTIPLE categories. `category`/`categoryLabel`/
  // `categoryPricingMode` are always the company's PRIMARY category — the one
  // every single-value display spot (card badge, profile page, search result
  // label) shows.
  category: string;
  categoryLabel: string;
  // Phase 9 — computed server-side from the company's PRIMARY category, so no
  // second call is needed to know whether this company may run a priced catalog.
  categoryPricingMode: ApiCategoryPricingMode;
  // Full category membership (admin/provider editors). Exactly one entry has
  // isPrimary: true.
  categories: { slug: string; label: string; pricingMode: ApiCategoryPricingMode; isPrimary: boolean }[];
  services: string[];
  rating: number;
  reviewCount: number;
  completedProjects: number;
  gallery: string[];
  projects: ApiProject[];
  reviews: ApiReview[];
  /** Published + active offerings; empty on card/list endpoints. */
  offerings?: ApiOffering[];
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
  // Availability — `busy` is the effective state (resolved against busyUntil
  // server-side). busyUntil = optional auto-reopen instant (epoch ms). busyNote =
  // optional customer-facing reason. See ApiAvailabilityPayload.
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
 * no catalog: chips + a direct request, exactly like before. FIXED_CATALOG lets
 * companies publish priced Offerings. Real enforcement is server-side
 * (api: offerings.service.ts assertCatalogEnabled) — this is just what the
 * value means, not what stops a write.
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
  /**
   * Admin only — how many of this category's companies have at least one
   * PUBLISHED Offering right now. Used by the admin CategoryEditor's
   * confirm-warning when switching FIXED_CATALOG → QUOTE_ONLY. Absent on the
   * public /categories payload.
   */
  publishedOfferingCompanyCount?: number;
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
  trackingToken?: string; // returned only on creation; gates public tracking/review
  createdAt: number;
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
}

/** PATCH /leads/:id — body shape */
export interface ApiLeadStatusPatch {
  status: ApiLeadStatus;
}

// ── Offerings (Feature B) ─────────────────────────────────────────────────────
// These live here, not in offerings.ts, because api/prisma/seed.ts imports
// data.ts across the package boundary. Anything data.ts references is typechecked
// under the API's tsconfig, which has no Vite types — so a type that transitively
// reached `import.meta.env` would break the API build. This file has no imports
// at all, so it is safe to reference from either side.

export type ApiOfferingKind = "SERVICE" | "PRODUCT";
export type ApiPricingModel = "FIXED" | "RANGE" | "PER_UNIT" | "ON_INSPECTION";
export type ApiPriceUnit =
  | "SQM" | "METER" | "PIECE" | "DOOR" | "WINDOW"
  | "ROOM" | "APARTMENT" | "HOUR" | "DAY" | "JOB";

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
   * public payload.
   */
  isPublished: boolean;
}

export interface ApiOffering {
  id: string;
  companyId: string;
  name: string;
  description: string | null;
  kind: ApiOfferingKind;
  pricingModel: ApiPricingModel;
  priceMin: number | null;
  priceMax: number | null;
  unit: ApiPriceUnit | null;
  minQty: number | null;
  image: string | null;
  note: string | null;
  sortOrder: number;
  isActive: boolean;
  isPublished: boolean;
  priceUpdatedAt: number | null;
  tiers: ApiOfferingTier[];
}

export interface ApiBundleRule {
  id: string;
  companyId: string;
  label: string | null;
  minItems: number;
  discountPercent: number;
  isActive: boolean;
  isPublished: boolean;
}

/**
 * One line of a multi-item request (Feature C).
 *
 * Every price is a SNAPSHOT from submission time. The row duplicates data that
 * could be read back through the offering on purpose: a request records what the
 * customer was quoted, and a later price change or rename must not rewrite it.
 */
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
