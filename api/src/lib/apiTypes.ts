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
