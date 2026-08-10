// Provider profile edits awaiting admin approval.
//
// Named `changeRequests`, not `profileRequests`: the backend model is generic and
// Feature B (offerings, tiers, bundle rules) files requests through the exact same
// endpoints and the same admin review screen. A `profile`-flavoured name here
// would be wrong the moment that lands.
//
// No localStorage cache, unlike siteReviews.ts: an approval queue is shared,
// mutable state that two people act on at once. A stale cached copy would show a
// provider "still under review" after an admin approved it, or let an admin act
// on a request that was already withdrawn. Always read through.
import { useCallback, useEffect, useState } from "react";
import { apiGet, apiPost, apiPatch, apiDelete, isApiConfigured } from "./api";
import type { StringKey } from "./i18n";

export type ChangeEntity = "COMPANY" | "OFFERING" | "OFFERING_TIER" | "BUNDLE_RULE";
export type ChangeOperation = "PUBLISH" | "UPDATE" | "DELETE";
export type ChangeRequestStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";

export interface ChangeRequest {
  id: string;
  companyId: string;
  companyName?: string;
  entity: ChangeEntity;
  entityId: string;
  operation: ChangeOperation;
  submittedById: string;
  changes: Record<string, unknown>;
  snapshot: Record<string, unknown>;
  note: string | null;
  status: ChangeRequestStatus;
  reviewedById: string | null;
  reviewedAt: number | null;
  reviewNote: string | null;
  createdAt: number;
  updatedAt: number;
  /** Fields an admin edited directly after submission (detail read only). */
  conflicts?: string[];
  /** The target row no longer exists. */
  entityMissing?: boolean;
}

export interface ProviderProfile {
  company: Record<string, unknown> & { id: string; slug: string; name: string };
  contact: { email: string | null; whatsapp: string | null };
  changeRequests: ChangeRequest[];
  pending: ChangeRequest | null;
}

export interface ReviewResult {
  request: ChangeRequest;
  applied: string[];
  skipped: string[];
}

/** Fields a provider may submit. Mirrors EDITABLE_FIELDS.COMPANY on the server —
 *  the server is the enforcement point; this drives which inputs we render. */
export const EDITABLE_COMPANY_FIELDS = [
  "name", "tagline", "about", "logo", "cover", "gallery",
  "phone", "whatsapp", "email", "location",
  "yearsExperience", "responseTime", "badges",
  "metaTitle", "metaDescription",
] as const;

export type EditableCompanyField = (typeof EDITABLE_COMPANY_FIELDS)[number];

/**
 * Translation keys for the editable profile fields. Resolve with
 * t(locale, FIELD_LABEL_KEYS[field]) at render time.
 *
 * The field ids are API contract; only their labels are translated. There is no
 * English-only label map any more — the admin review screen reads these too.
 */
export const FIELD_LABEL_KEYS: Record<string, StringKey> = {
  name: "prov_field_name",
  tagline: "prov_field_tagline",
  about: "prov_field_about",
  logo: "prov_field_logo",
  cover: "prov_field_cover",
  gallery: "prov_field_gallery",
  phone: "prov_field_phone",
  whatsapp: "prov_field_whatsapp",
  email: "prov_field_email",
  location: "prov_field_location",
  yearsExperience: "prov_field_yearsExperience",
  responseTime: "prov_field_responseTime",
  badges: "prov_field_badges",
  metaTitle: "prov_field_metaTitle",
  metaDescription: "prov_field_metaDescription",
};

/** Image-valued fields — the review UI renders thumbnails for these. */
export const IMAGE_FIELDS = new Set(["logo", "cover"]);
export const IMAGE_LIST_FIELDS = new Set(["gallery"]);

// ── Provider ─────────────────────────────────────────────────────────────────

export function fetchProviderProfile(): Promise<ProviderProfile> {
  return apiGet<ProviderProfile>("/provider/profile");
}

export function submitChangeRequest(params: {
  entityId: string;
  changes: Record<string, unknown>;
  note?: string;
}): Promise<ChangeRequest> {
  return apiPost<ChangeRequest>("/provider/change-requests", {
    entity: "COMPANY",
    entityId: params.entityId,
    changes: params.changes,
    note: params.note,
  });
}

export function cancelChangeRequest(id: string): Promise<void> {
  return apiDelete(`/provider/change-requests/${id}`);
}

/**
 * A provider's own change requests.
 *
 * Providers MUST use this and not listChangeRequests() — that one hits
 * /admin/change-requests, which is adminOnly and returns 403 for them.
 */
export function listMyChangeRequests(params: {
  status?: ChangeRequestStatus;
  entity?: ChangeEntity;
  page?: number;
  pageSize?: number;
} = {}): Promise<ChangeRequestPage> {
  const sp = new URLSearchParams();
  if (params.status) sp.set("status", params.status);
  if (params.entity) sp.set("entity", params.entity);
  sp.set("page", String(params.page ?? 1));
  sp.set("pageSize", String(params.pageSize ?? 20));
  return apiGet<ChangeRequestPage>(`/provider/change-requests?${sp.toString()}`);
}

// ── Admin ────────────────────────────────────────────────────────────────────

export interface ChangeRequestPage {
  data: ChangeRequest[];
  meta: { total: number; page: number; pageSize: number };
}

export function listChangeRequests(params: {
  status?: ChangeRequestStatus;
  entity?: ChangeEntity;
  page?: number;
} = {}): Promise<ChangeRequestPage> {
  const q = new URLSearchParams();
  if (params.status) q.set("status", params.status);
  if (params.entity) q.set("entity", params.entity);
  if (params.page) q.set("page", String(params.page));
  const qs = q.toString();
  return apiGet<ChangeRequestPage>(`/admin/change-requests${qs ? `?${qs}` : ""}`);
}

export function getChangeRequest(id: string): Promise<ChangeRequest> {
  return apiGet<ChangeRequest>(`/admin/change-requests/${id}`);
}

export interface PriceReference {
  available: boolean;
  reason?: "not_per_unit" | "insufficient_data";
  unit?: string;
  sampleSize?: number;
  min?: number;
  median?: number;
  max?: number;
}

/**
 * Category price reference for an offering under review. Advisory only — the
 * provider sets the price and the admin's approval is the control; this just
 * saves them opening another tab to sanity-check a per-unit rate.
 */
export function getPriceReference(offeringId: string): Promise<{
  reference: PriceReference;
  outlier: boolean;
}> {
  return apiGet(`/admin/offerings/${offeringId}/reference`);
}

export function reviewChangeRequest(
  id: string,
  input: { action: "approve" | "reject"; reviewNote?: string; fields?: string[] },
): Promise<ReviewResult> {
  return apiPatch<ReviewResult>(`/admin/change-requests/${id}`, input);
}

// ── Hooks ────────────────────────────────────────────────────────────────────

/** Pending-request count for the admin nav badge. */
export function usePendingChangeCount(): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!isApiConfigured()) return;
    let alive = true;
    listChangeRequests({ status: "PENDING" })
      .then((p) => { if (alive) setCount(p.meta.total); })
      .catch(() => { if (alive) setCount(0); });
    return () => { alive = false; };
  }, []);
  return count;
}

/** Admin queue, with an explicit refresh for use after approve/reject. */
export function useChangeRequests(status: ChangeRequestStatus | "ALL" = "PENDING") {
  const [items, setItems] = useState<ChangeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(() => {
    if (!isApiConfigured()) { setLoading(false); return; }
    setLoading(true);
    listChangeRequests(status === "ALL" ? {} : { status })
      .then((p) => { setItems(p.data); setError(""); })
      .catch((e) => setError(e instanceof Error ? e.message : "Couldn't load change requests."))
      .finally(() => setLoading(false));
  }, [status]);

  useEffect(refresh, [refresh]);

  return { items, loading, error, refresh };
}

// ── Diff helpers (shared by both dashboards) ─────────────────────────────────

/** Human-readable rendering of a field value for the diff view. */
export function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "—";
  return String(value);
}

/** Only the keys whose submitted value actually differs from the snapshot. */
export function changedFields(request: ChangeRequest): string[] {
  return Object.keys(request.changes);
}
