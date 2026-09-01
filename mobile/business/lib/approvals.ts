/**
 * The five moderation queues, fronted by one module — see
 * docs/architecture/business-app/phase-9-admin-moderation.md. Each queue's
 * "admin item" type is mirrored here from its api service file (companyId/
 * companyName/companySlug joined onto the base entity), the same pattern
 * lib/profile.ts already uses for ApiChangeRequest: these are api-internal
 * types, never exported from @alassema/core.
 */
import type { ApiFeedback, ApiPage, ApiProject, ApiProjectStatus, ApiReview, ApiSiteReview } from "@alassema/core";
import { apiDelete, apiGet, apiPatch, apiPut } from "@alassema/mobile-shared";
import type { ApiChangeRequest, ChangeEntity } from "./profile";

export type ApprovalQueue = "changeRequest" | "project" | "review" | "siteReview" | "feedback";

// ── Change requests ──────────────────────────────────────────────────────────

export function fetchPendingChangeRequests(query: { page?: number; pageSize?: number } = {}): Promise<ApiPage<ApiChangeRequest>> {
  const params = new URLSearchParams({ status: "PENDING" });
  if (query.page) params.set("page", String(query.page));
  if (query.pageSize) params.set("pageSize", String(query.pageSize));
  return apiGet<ApiPage<ApiChangeRequest>>(`/admin/change-requests?${params.toString()}`);
}

/** GET /admin/change-requests/[id] — the request plus `conflicts`/
 *  `entityMissing` against the live row, computed server-side only here. */
export function fetchChangeRequest(id: string): Promise<ApiChangeRequest> {
  return apiGet<ApiChangeRequest>(`/admin/change-requests/${id}`);
}

export interface ReviewChangeRequestResult {
  request: ApiChangeRequest;
  applied: string[];
  skipped: string[];
}

/** PATCH /admin/change-requests/[id]. `fields` narrows an approval to a
 *  subset (partial approval) — omit to apply every changed field. Rejecting
 *  with `fields` set is a validation error server-side. */
export function reviewChangeRequest(
  id: string,
  input: { action: "approve" | "reject"; reviewNote?: string; fields?: string[] },
): Promise<ReviewChangeRequestResult> {
  return apiPatch<ReviewChangeRequestResult>(`/admin/change-requests/${id}`, input);
}

export const CHANGE_ENTITY_LABEL: Record<ChangeEntity, string> = {
  COMPANY: "بيانات الشركة",
  OFFERING: "خدمة",
  OFFERING_TIER: "فئة سعر",
  BUNDLE_RULE: "قاعدة باقة",
};

// ── Projects ──────────────────────────────────────────────────────────────────

export interface ModerationProject extends ApiProject {
  id: string;
  companyId: string;
  companyName: string;
  companySlug: string;
}

export function fetchPendingProjects(query: { page?: number; pageSize?: number } = {}): Promise<ApiPage<ModerationProject>> {
  const params = new URLSearchParams({ status: "PENDING" });
  if (query.page) params.set("page", String(query.page));
  if (query.pageSize) params.set("pageSize", String(query.pageSize));
  return apiGet<ApiPage<ModerationProject>>(`/admin/projects?${params.toString()}`);
}

export function reviewProject(id: string, status: ApiProjectStatus): Promise<ApiProject> {
  return apiPatch<ApiProject>(`/admin/projects/${id}`, { status });
}

export function deleteProject(id: string): Promise<void> {
  return apiDelete<void>(`/admin/projects/${id}`);
}

// ── Company reviews ───────────────────────────────────────────────────────────

export interface AdminReviewItem extends ApiReview {
  id: string;
  companyId: string;
  companyName: string;
  companySlug: string;
}

export function fetchPendingReviews(query: { page?: number; pageSize?: number } = {}): Promise<ApiPage<AdminReviewItem>> {
  const params = new URLSearchParams({ status: "pending" });
  if (query.page) params.set("page", String(query.page));
  if (query.pageSize) params.set("pageSize", String(query.pageSize));
  return apiGet<ApiPage<AdminReviewItem>>(`/admin/reviews?${params.toString()}`);
}

export function setReviewApproved(id: string, approved: boolean): Promise<ApiReview> {
  return apiPatch<ApiReview>(`/admin/reviews/${id}`, { approved });
}

export function deleteReview(id: string): Promise<void> {
  return apiDelete<void>(`/admin/reviews/${id}`);
}

// ── Site reviews (homepage marquee) ─────────────────────────────────────────

/** GET /admin/site-reviews has no status filter — visible/hidden are both
 *  returned for moderation (see the route's own comment). The queue segment
 *  here narrows to `!visible` client-side, since "pending" for a site
 *  review means "submitted but not yet made visible", not a separate
 *  server-side status. */
export async function fetchPendingSiteReviews(query: { page?: number; pageSize?: number } = {}): Promise<ApiPage<ApiSiteReview>> {
  const params = new URLSearchParams();
  if (query.page) params.set("page", String(query.page ?? 1));
  params.set("pageSize", String(query.pageSize ?? 50));
  const result = await apiGet<ApiPage<ApiSiteReview>>(`/admin/site-reviews?${params.toString()}`);
  const pending = result.data.filter((r) => !r.visible);
  return { data: pending, meta: { ...result.meta, total: pending.length } };
}

export function setSiteReviewVisible(id: string, visible: boolean): Promise<ApiSiteReview> {
  return apiPatch<ApiSiteReview>(`/admin/site-reviews/${id}`, { visible });
}

export function deleteSiteReview(id: string): Promise<void> {
  return apiDelete<void>(`/admin/site-reviews/${id}`);
}

/** GET /site-reviews/settings is PUBLIC (no admin variant exists) — reading
 *  it from here is fine, it needs no auth. Only the PUT to change it is
 *  adminOnly. */
export function fetchSiteReviewSettings(): Promise<{ enabled: boolean }> {
  return apiGet<{ enabled: boolean }>("/site-reviews/settings");
}

export function setSiteReviewSettings(enabled: boolean): Promise<{ enabled: boolean }> {
  return apiPut<{ enabled: boolean }>("/admin/site-reviews/settings", { enabled });
}

// ── Feedback ──────────────────────────────────────────────────────────────────

export async function fetchPendingFeedback(query: { page?: number; pageSize?: number } = {}): Promise<ApiPage<ApiFeedback>> {
  const params = new URLSearchParams();
  if (query.page) params.set("page", String(query.page ?? 1));
  params.set("pageSize", String(query.pageSize ?? 50));
  const result = await apiGet<ApiPage<ApiFeedback>>(`/admin/feedback?${params.toString()}`);
  const pending = result.data.filter((f) => !f.isRead);
  return { data: pending, meta: { ...result.meta, total: pending.length } };
}

export const FEEDBACK_TYPE_LABEL: Record<ApiFeedback["type"], string> = {
  problem: "مشكلة",
  suggestion: "اقتراح",
  inquiry: "استفسار",
};

export function setFeedbackRead(id: string, isRead: boolean): Promise<ApiFeedback> {
  return apiPatch<ApiFeedback>(`/admin/feedback/${id}`, { isRead });
}

export function deleteFeedback(id: string): Promise<void> {
  return apiDelete<void>(`/admin/feedback/${id}`);
}
