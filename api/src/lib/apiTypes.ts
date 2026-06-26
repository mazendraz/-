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
  phone: string;
  location: string;
  yearsExperience: number;
  responseTime: string;
  verifiedSince: string;
  badges: string[];
  featured: boolean;
  verified: boolean;
  // Internal contact fields — lead notifications are sent here. Returned ONLY in
  // admin payloads (so the editor can round-trip them); omitted from public ones.
  email?: string | null;
  whatsapp?: string | null;
}

// ── Categories ────────────────────────────────────────────────────────────────

export interface ApiCategory {
  slug: string;
  label: string;
  description: string;
  icon: string;
  cover: string;
  count: number;
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

// ── Audit log (admin-only) ─────────────────────────────────────────────────────

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
