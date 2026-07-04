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
