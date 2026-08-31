import type { ApiOffering, ApiPriceUnit, ApiPricingModel } from "@alassema/core";
import { apiDelete, apiGet, apiPatch, apiPost } from "@alassema/mobile-shared";

export interface OfferingInput {
  name: string;
  description?: string | null;
  nameAr?: string | null;
  descriptionAr?: string | null;
  kind?: "SERVICE" | "PRODUCT";
  pricingModel?: ApiPricingModel;
  priceMin?: number | null;
  priceMax?: number | null;
  unit?: ApiPriceUnit | null;
  minQty?: number | null;
  image?: string | null;
  note?: string | null;
}

export type WritePath = "direct" | "review";

export interface UpdateResult {
  path: WritePath;
  offering?: ApiOffering;
  changeRequestId?: string;
}

export interface RemoveResult {
  path: WritePath;
  changeRequestId?: string;
}

export interface TierWriteResult {
  path: WritePath;
  offering: ApiOffering;
  changeRequestId?: string;
}

export interface TierInput {
  label: string;
  qtyMin?: number | null;
  qtyMax?: number | null;
  priceMin?: number | null;
  priceMax?: number | null;
  sortOrder?: number;
}

/** GET /provider/offerings — everything this company owns, drafts included
 *  (unlike the public profile, which only ever shows published+active). */
export function fetchOfferings(): Promise<ApiOffering[]> {
  return apiGet<ApiOffering[]>("/provider/offerings");
}

/** POST /provider/offerings — always creates a DRAFT. Nothing a provider
 *  types reaches the public profile without an admin approval. */
export function createOffering(input: OfferingInput): Promise<ApiOffering> {
  return apiPost<ApiOffering>("/provider/offerings", input);
}

/**
 * PATCH /provider/offerings/[id] — the SERVER decides the write path, not
 * this function: a draft is written straight through; a PUBLISHED offering
 * gets a ChangeRequest filed instead and the live row is untouched. Check
 * `result.path` to know which happened — "review" means `offering` is
 * absent and only `changeRequestId` is set.
 */
export function updateOffering(id: string, patch: Partial<OfferingInput>): Promise<UpdateResult> {
  return apiPatch<UpdateResult>(`/provider/offerings/${id}`, patch);
}

/** DELETE — a draft goes immediately; a published offering needs approval
 *  and stays live until then (`path === "review"`). */
export function deleteOffering(id: string): Promise<RemoveResult> {
  return apiDelete<RemoveResult>(`/provider/offerings/${id}`);
}

/** PATCH /provider/offerings/[id]/visibility — isActive/sortOrder, applied
 *  IMMEDIATELY even on a published offering. The one deliberate exception to
 *  "everything waits for approval": hiding a wrong price can't wait two days. */
export function setOfferingVisibility(id: string, patch: { isActive?: boolean; sortOrder?: number }): Promise<ApiOffering> {
  return apiPatch<ApiOffering>(`/provider/offerings/${id}/visibility`, patch);
}

/** POST /provider/offerings/[id]/publish — files a PUBLISH change request.
 *  From this moment the draft is LOCKED against further edits until it's
 *  reviewed or withdrawn — a subsequent PATCH will 409. */
export function requestPublish(id: string): Promise<{ changeRequestId: string }> {
  return apiPost<{ changeRequestId: string }>(`/provider/offerings/${id}/publish`, {});
}

export function addTier(offeringId: string, input: TierInput): Promise<TierWriteResult> {
  return apiPost<TierWriteResult>(`/provider/offerings/${offeringId}/tiers`, input);
}

export function removeTier(offeringId: string, tierId: string): Promise<TierWriteResult> {
  return apiDelete<TierWriteResult>(`/provider/offerings/${offeringId}/tiers/${tierId}`);
}
