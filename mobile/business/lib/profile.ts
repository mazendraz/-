import type { ApiCompany, ApiPage } from "@alassema/core";
import { apiGet, apiPost } from "@alassema/mobile-shared";

/** Not part of @alassema/core — api's changeRequests.service.ts declares
 *  ChangeEntity/ChangeOperation/ChangeRequestStatus as Prisma enums, not
 *  public contract types. Mirrored here from prisma/schema.prisma. */
export type ChangeEntity = "COMPANY" | "OFFERING" | "OFFERING_TIER" | "BUNDLE_RULE";
export type ChangeOperation = "PUBLISH" | "UPDATE" | "DELETE";
export type ChangeRequestStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";

export interface ApiChangeRequest {
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
  /** Present only on the admin detail read (GET /admin/change-requests/[id]) —
   *  fields whose live value drifted from `snapshot` since submission, i.e.
   *  an admin edited them directly while the request waited. See
   *  lib/approvals.ts, which is the only caller that ever sees these. */
  conflicts?: string[];
  /** Admin detail read only — true when the target row no longer exists. */
  entityMissing?: boolean;
}

export interface ProfileResponse {
  company: ApiCompany;
  contact: { email: string | null; whatsapp: string | null };
  changeRequests: ApiChangeRequest[];
  pending: ApiChangeRequest | null;
}

/** GET /provider/profile — the company + its change-request history in one
 *  round trip, so the "under review" banner and the form render together. */
export function fetchProfile(): Promise<ProfileResponse> {
  return apiGet<ProfileResponse>("/provider/profile");
}

/**
 * The fields a provider may edit at all — api's changeRequests.service.ts
 * EDITABLE_FIELDS for the COMPANY entity, mirrored here. Deliberately a
 * SUBSET is exposed on this screen (tagline, about, phone, whatsapp, email,
 * location, responseTime): logo/cover/gallery need the upload flow and
 * name/nameAr/yearsExperience/badges/metaTitle/metaDescription are lower-
 * value on a phone. Anything not sent here is simply not editable from this
 * screen yet — not silently dropped, just not built.
 */
export interface CompanyEditableFields {
  tagline?: string;
  about?: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  location?: string;
  responseTime?: string;
}

/** POST /provider/change-requests — files (or merges into an existing
 *  PENDING request for) an edit. Nothing here goes live until an admin
 *  approves it (phase 9). */
export function submitProfileChange(
  companyId: string,
  changes: CompanyEditableFields,
  note?: string,
): Promise<ApiChangeRequest> {
  return apiPost<ApiChangeRequest>("/provider/change-requests", {
    entity: "COMPANY",
    entityId: companyId,
    changes,
    note,
  });
}

export function fetchChangeRequests(query: { page?: number; pageSize?: number } = {}): Promise<ApiPage<ApiChangeRequest>> {
  const params = new URLSearchParams();
  if (query.page) params.set("page", String(query.page));
  if (query.pageSize) params.set("pageSize", String(query.pageSize));
  const qs = params.toString();
  return apiGet<ApiPage<ApiChangeRequest>>(`/provider/change-requests${qs ? `?${qs}` : ""}`);
}
