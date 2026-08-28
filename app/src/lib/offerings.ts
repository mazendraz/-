// Offerings — a company's priced services and products.
//
// Read-through, no localStorage cache. Draft/published state and pending review
// state are shared and change from two directions (the provider edits, an admin
// approves); a cached copy would show a provider "published" for something still
// in the queue, or the reverse.
import { useCallback, useEffect, useState } from "react";
import { apiGet, apiPost, apiPatch, apiDelete, isApiConfigured } from "./api";

// Shapes live in apiTypes.ts (which has zero imports) because data.ts must be
// typecheckable under the API package too — see the note there.
import type {
  ApiOffering, ApiOfferingTier, ApiBundleRule,
  ApiOfferingKind, ApiPricingModel, ApiPriceUnit,
} from "./apiTypes";

export type OfferingKind = ApiOfferingKind;
export type PricingModel = ApiPricingModel;
export type PriceUnit = ApiPriceUnit;
export type OfferingTier = ApiOfferingTier;
export type Offering = ApiOffering;
export type BundleRule = ApiBundleRule;

export interface OfferingInput {
  name: string;
  description?: string | null;
  nameAr?: string | null;
  descriptionAr?: string | null;
  tags?: string[] | null;
  kind?: OfferingKind;
  pricingModel?: PricingModel;
  priceMin?: number | null;
  priceMax?: number | null;
  unit?: PriceUnit | null;
  minQty?: number | null;
  image?: string | null;
  note?: string | null;
}

/**
 * What a write actually did. A published offering is never edited in place — the
 * API files a change request instead — so callers must tell the provider which
 * of the two happened rather than assuming the change is live.
 */
export interface WriteResult {
  path: "direct" | "review";
  offering?: Offering;
  changeRequestId?: string;
}

// ── Provider ─────────────────────────────────────────────────────────────────

export function listOfferings(): Promise<Offering[]> {
  return apiGet<Offering[]>("/provider/offerings");
}

export function createOffering(input: OfferingInput): Promise<Offering> {
  return apiPost<Offering>("/provider/offerings", input);
}

export function updateOffering(id: string, patch: Partial<OfferingInput>): Promise<WriteResult> {
  return apiPatch<WriteResult>(`/provider/offerings/${id}`, patch);
}

export function deleteOffering(id: string): Promise<{ path: "direct" | "review" }> {
  return apiDelete(`/provider/offerings/${id}`) as unknown as Promise<{ path: "direct" | "review" }>;
}

export function requestPublish(id: string): Promise<{ changeRequestId: string }> {
  return apiPost<{ changeRequestId: string }>(`/provider/offerings/${id}/publish`, {});
}

/** isActive / sortOrder — applied immediately, no review. */
export function setOfferingVisibility(
  id: string,
  patch: { isActive?: boolean; sortOrder?: number },
): Promise<Offering> {
  return apiPatch<Offering>(`/provider/offerings/${id}/visibility`, patch);
}

/**
 * A quantity band write. Same two-path contract as an offering edit, and for the
 * same reason: a tier price OVERRIDES the offering's for the line it matches, so
 * a band on a published offering is a public price change and waits for review.
 * `offering` is always the current state of the parent, drafts included.
 */
export interface TierWriteResult {
  path: "direct" | "review";
  offering: Offering;
  changeRequestId?: string;
}

export function addTier(
  offeringId: string,
  input: { label: string; qtyMin?: number | null; qtyMax?: number | null; priceMin?: number | null; priceMax?: number | null },
): Promise<TierWriteResult> {
  return apiPost<TierWriteResult>(`/provider/offerings/${offeringId}/tiers`, input);
}

export function removeTier(offeringId: string, tierId: string): Promise<TierWriteResult> {
  return apiDelete(`/provider/offerings/${offeringId}/tiers/${tierId}`) as unknown as Promise<TierWriteResult>;
}

export function listBundleRules(): Promise<BundleRule[]> {
  return apiGet<BundleRule[]>("/provider/bundle-rules");
}

export function createBundleRule(input: {
  label?: string | null; minItems: number; discountPercent: number;
}): Promise<BundleRule> {
  return apiPost<BundleRule>("/provider/bundle-rules", input);
}

// ── Admin ────────────────────────────────────────────────────────────────────
// Straight through, published immediately — no draft/review dance (the admin
// IS the reviewer). Same category pricing-mode gate as the provider path
// applies server-side (offerings.service.ts assertCatalogEnabled); this panel
// is only ever shown for a company whose category already allows it.

export function listCompanyOfferings(companyId: string): Promise<Offering[]> {
  return apiGet<Offering[]>(`/admin/companies/${companyId}/offerings`);
}

export function adminCreateOffering(companyId: string, input: OfferingInput): Promise<Offering> {
  return apiPost<Offering>(`/admin/companies/${companyId}/offerings`, input);
}

export function adminUpdateOffering(
  companyId: string,
  id: string,
  patch: Partial<OfferingInput>,
): Promise<Offering> {
  return apiPatch<Offering>(`/admin/companies/${companyId}/offerings/${id}`, patch);
}

export function adminDeleteOffering(companyId: string, id: string): Promise<void> {
  return apiDelete(`/admin/companies/${companyId}/offerings/${id}`);
}

export function adminSetOfferingVisibility(
  companyId: string,
  id: string,
  patch: { isActive?: boolean; sortOrder?: number },
): Promise<Offering> {
  return apiPatch<Offering>(`/admin/companies/${companyId}/offerings/${id}/visibility`, patch);
}

// ── Hooks ────────────────────────────────────────────────────────────────────

export function useOfferings() {
  const [items, setItems] = useState<Offering[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(() => {
    if (!isApiConfigured()) { setLoading(false); return; }
    setLoading(true);
    listOfferings()
      .then((rows) => { setItems(rows); setError(""); })
      .catch((e) => setError(e instanceof Error ? e.message : "Couldn't load your services."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(refresh, [refresh]);
  return { items, loading, error, refresh };
}

// ── Grouping ─────────────────────────────────────────────────────────────────

/** Split into services and products — the public profile lists them separately. */
export function splitByKind(offerings: Offering[]): { services: Offering[]; products: Offering[] } {
  return {
    services: offerings.filter((o) => o.kind === "SERVICE"),
    products: offerings.filter((o) => o.kind === "PRODUCT"),
  };
}

/** Review state for a row, for the provider's status column. */
export type OfferingState = "draft" | "pending-publish" | "published" | "hidden";

export function offeringState(
  offering: Offering,
  pendingEntityIds: Set<string>,
): OfferingState {
  if (offering.isPublished && !offering.isActive) return "hidden";
  if (offering.isPublished) return "published";
  if (pendingEntityIds.has(offering.id)) return "pending-publish";
  return "draft";
}
