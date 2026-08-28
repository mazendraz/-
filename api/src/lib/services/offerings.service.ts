// Offerings — a company's priced services and products.
//
// ── The one rule that decides every write path ────────────────────────────────
//   isPublished = false → a draft the provider owns  → write straight to the row
//   isPublished = true  → public content             → go through ChangeRequest
//
// The ROW'S STATE decides, not the endpoint. That is what keeps a published
// offering visible and unchanged for the whole review period instead of
// vanishing from the profile because someone fixed a typo.
//
// Every write path funnels through assertWritePath() so the branch exists once.
// Spread across endpoints it would eventually be forgotten in one of them, and
// that one would be a hole straight past review.
import { prisma } from "@/lib/prisma";
import type { AuthUser } from "@/lib/auth";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/utils/errors";
import * as audit from "@/lib/services/audit.service";
import * as changeRequests from "@/lib/services/changeRequests.service";

export type WritePath = "direct" | "review";

interface RowState {
  id: string;
  isPublished: boolean;
}

/**
 * The actual gate for Phase 9 (category pricing mode) — hiding the pricing tab
 * in the provider dashboard is decoration, not security. Anyone who can reach
 * this service (a route, a script, a future endpoint) must pass through here
 * first, so a company with no FIXED_CATALOG category can never end up with a
 * live Offering no matter which door someone comes in through.
 *
 * A company may belong to several categories (see CompanyCategory) — this is a
 * PERMISSIVE UNION: eligible if ANY linked category is FIXED_CATALOG, not just
 * the primary one. A company doing both "Interior Finishing" (FIXED_CATALOG)
 * and "Landscaping" (QUOTE_ONLY) still gets a catalog.
 *
 * Checked at CREATE/EDIT/PUBLISH time only — never on delete, hide, or
 * reordering. A category can be switched away from FIXED_CATALOG after
 * companies already have live Offerings (see categories.service.ts), and those
 * companies must still be able to withdraw or hide what they already have;
 * they just can't add to or change it anymore (unless another linked category
 * still keeps them eligible).
 */
async function assertCatalogEnabled(companyId: string): Promise<void> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { categories: { select: { category: { select: { pricingMode: true } } } } },
  });
  if (!company) throw new NotFoundError("Company");
  const eligible = company.categories.some((cc) => cc.category.pricingMode === "FIXED_CATALOG");
  if (!eligible) {
    throw new ValidationError(
      "None of this company's categories use a fixed price catalog, so offerings can't be created or edited.",
    );
  }
}

/**
 * Decide how a write to this row must be performed — and refuse outright when a
 * publish request is pending against it.
 *
 * The lock matters more than it looks. Without it: provider submits PUBLISH on a
 * clean draft → it waits in the queue → the row is still a draft, so direct
 * writes are still allowed → provider rewrites the price to 1 EGP → admin
 * approves what they reviewed → the *rewritten* content goes public. The admin
 * approved one thing and a different thing shipped.
 *
 * `isActive` / `sortOrder` bypass this entirely (see setVisibility) — they are
 * operational controls, and a provider must be able to hide a wrong price NOW.
 */
export async function assertWritePath(
  entity: "OFFERING" | "OFFERING_TIER" | "BUNDLE_RULE",
  row: RowState,
): Promise<WritePath> {
  if (row.isPublished) return "review";

  const pendingPublish = await prisma.changeRequest.findFirst({
    where: { entity, entityId: row.id, status: "PENDING", operation: "PUBLISH" },
    select: { id: true },
  });
  if (pendingPublish) {
    throw new ConflictError(
      "This draft is waiting for publish approval and can't be edited. " +
        "Withdraw the publish request first if you need to change it.",
    );
  }
  return "direct";
}

// ── Serialization ────────────────────────────────────────────────────────────

// These two were a FOURTH hand-written copy of shapes that also existed in
// api/src/lib/apiTypes.ts, app/src/lib/apiTypes.ts and now @alassema/core. The
// copies had already diverged — this one typed `unit` as a free-form string
// where the value comes from a Prisma enum — and nothing connected them, so the
// serializer only failed to typecheck once core made the other definition
// authoritative.
//
// Re-exported rather than deleted so every `from "@/lib/services/offerings.service"`
// import keeps working.
import type { ApiOffering, ApiOfferingTier } from "@/lib/apiTypes";
export type { ApiOffering, ApiOfferingTier };

export interface ApiBundleRule {
  id: string;
  companyId: string;
  label: string | null;
  minItems: number;
  discountPercent: number;
  isActive: boolean;
  isPublished: boolean;
}

type TierRow = {
  id: string; label: string; qtyMin: number | null; qtyMax: number | null;
  priceMin: number | null; priceMax: number | null; sortOrder: number;
  isPublished: boolean;
};

type OfferingRow = {
  id: string; companyId: string; name: string; description: string | null;
  nameAr: string | null; descriptionAr: string | null; tags: string[];
  kind: string; pricingModel: string; priceMin: number | null; priceMax: number | null;
  unit: string | null; minQty: number | null; image: string | null; note: string | null;
  sortOrder: number; isActive: boolean; isPublished: boolean;
  priceUpdatedAt: Date | null; tiers?: TierRow[];
};

export function serializeTier(t: TierRow): ApiOfferingTier {
  return {
    id: t.id, label: t.label, qtyMin: t.qtyMin, qtyMax: t.qtyMax,
    priceMin: t.priceMin, priceMax: t.priceMax, sortOrder: t.sortOrder,
    isPublished: t.isPublished,
  };
}

export function serializeOffering(o: OfferingRow): ApiOffering {
  return {
    id: o.id,
    companyId: o.companyId,
    name: o.name,
    description: o.description,
    nameAr: o.nameAr,
    descriptionAr: o.descriptionAr,
    tags: o.tags,
    kind: o.kind as ApiOffering["kind"],
    pricingModel: o.pricingModel as ApiOffering["pricingModel"],
    priceMin: o.priceMin,
    priceMax: o.priceMax,
    // Same cast as kind/pricingModel above, and for the same reason: the row
    // shape types these as plain strings because Prisma's generated enums are
    // not imported here, while the contract constrains them to their unions.
    unit: o.unit as ApiOffering["unit"],
    minQty: o.minQty,
    image: o.image,
    note: o.note,
    sortOrder: o.sortOrder,
    isActive: o.isActive,
    isPublished: o.isPublished,
    priceUpdatedAt: o.priceUpdatedAt?.getTime() ?? null,
    tiers: (o.tiers ?? []).map(serializeTier),
  };
}

/** Provider/admin: every tier, drafts included, so the editor can show them. */
const TIER_INCLUDE = { tiers: { orderBy: { sortOrder: "asc" } } } as const;

/**
 * PUBLIC: published tiers only.
 *
 * The parent offering being published is NOT sufficient. A tier added to an
 * already-live offering starts as a draft awaiting its own approval, and a tier
 * price overrides the offering's — so an unreviewed row reaching this include
 * would be an unreviewed public price.
 */
const PUBLIC_TIER_INCLUDE = {
  tiers: { where: { isPublished: true }, orderBy: { sortOrder: "asc" } },
} as const;

// ── Reads ────────────────────────────────────────────────────────────────────

/** PUBLIC: what a visitor sees on a company profile — published AND active only. */
export async function listPublic(companyId: string): Promise<ApiOffering[]> {
  const rows = await prisma.offering.findMany({
    where: { companyId, isPublished: true, isActive: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: PUBLIC_TIER_INCLUDE,
  });
  return rows.map(serializeOffering);
}

/** PROVIDER/ADMIN: everything, drafts included. */
export async function listForCompany(companyId: string): Promise<ApiOffering[]> {
  const rows = await prisma.offering.findMany({
    where: { companyId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: TIER_INCLUDE,
  });
  return rows.map(serializeOffering);
}

async function loadOwned(companyId: string, id: string) {
  const row = await prisma.offering.findUnique({ where: { id }, include: TIER_INCLUDE });
  if (!row || row.companyId !== companyId) throw new NotFoundError("Offering");
  return row;
}

// ── Provider writes ──────────────────────────────────────────────────────────

export interface OfferingInput {
  name: string;
  description?: string | null;
  nameAr?: string | null;
  descriptionAr?: string | null;
  tags?: string[] | null;
  kind?: "SERVICE" | "PRODUCT";
  pricingModel?: "FIXED" | "RANGE" | "PER_UNIT" | "ON_INSPECTION";
  priceMin?: number | null;
  priceMax?: number | null;
  unit?: string | null;
  minQty?: number | null;
  image?: string | null;
  note?: string | null;
}

/** Always creates a DRAFT. Nothing reaches the public profile without approval. */
export async function create(companyId: string, input: OfferingInput): Promise<ApiOffering> {
  await assertCatalogEnabled(companyId);
  const created = await prisma.offering.create({
    data: {
      companyId,
      name: input.name,
      description: input.description ?? null,
      nameAr: input.nameAr ?? null,
      descriptionAr: input.descriptionAr ?? null,
      tags: input.tags ?? [],
      kind: input.kind ?? "SERVICE",
      pricingModel: input.pricingModel ?? "RANGE",
      priceMin: input.priceMin ?? null,
      priceMax: input.priceMax ?? null,
      unit: (input.unit as never) ?? null,
      minQty: input.minQty ?? null,
      image: input.image ?? null,
      note: input.note ?? null,
      isPublished: false,
      priceUpdatedAt: new Date(),
    },
    include: TIER_INCLUDE,
  });
  return serializeOffering(created);
}

export interface UpdateResult {
  path: WritePath;
  offering?: ApiOffering;
  changeRequestId?: string;
}

/**
 * Update an offering. Draft → written straight through. Published → the row is
 * not touched at all; a ChangeRequest is filed and the live listing carries on
 * unchanged until an admin acts.
 */
export async function update(
  user: AuthUser,
  companyId: string,
  id: string,
  patch: Partial<OfferingInput>,
): Promise<UpdateResult> {
  await assertCatalogEnabled(companyId);
  const row = await loadOwned(companyId, id);
  const path = await assertWritePath("OFFERING", row);

  if (path === "review") {
    const cr = await changeRequests.submit(user, companyId, {
      entity: "OFFERING",
      entityId: id,
      operation: "UPDATE",
      changes: patch as Record<string, unknown>,
    });
    return { path, changeRequestId: cr.id };
  }

  const touchesPrice = ["priceMin", "priceMax", "pricingModel", "unit", "minQty"]
    .some((f) => f in patch);
  const updated = await prisma.offering.update({
    where: { id },
    data: {
      ...(patch as Record<string, never>),
      ...(touchesPrice ? { priceUpdatedAt: new Date() } : {}),
    },
    include: TIER_INCLUDE,
  });
  return { path, offering: serializeOffering(updated) };
}

export interface RemoveResult {
  path: WritePath;
  changeRequestId?: string;
}

/** Delete a draft outright; a published offering needs approval first. */
export async function remove(
  user: AuthUser,
  companyId: string,
  id: string,
): Promise<RemoveResult> {
  const row = await loadOwned(companyId, id);
  const path = await assertWritePath("OFFERING", row);

  if (path === "review") {
    const cr = await changeRequests.submit(user, companyId, {
      entity: "OFFERING", entityId: id, operation: "DELETE", changes: {},
    });
    return { path, changeRequestId: cr.id };
  }

  await prisma.$transaction(async (tx) => {
    // entityId has no FK, so a pending request would otherwise outlive the row
    // and 500 the admin queue when someone opened it.
    await changeRequests.cancelPendingForEntity(tx as never, "OFFERING", id);
    await tx.offering.delete({ where: { id } });
  });
  return { path };
}

/** File a PUBLISH request for a draft. */
export async function requestPublish(
  user: AuthUser,
  companyId: string,
  id: string,
): Promise<{ changeRequestId: string }> {
  await assertCatalogEnabled(companyId);
  const row = await loadOwned(companyId, id);
  if (row.isPublished) throw new ValidationError("This offering is already published.");
  // Also surfaces the 409 when a publish request is already pending.
  await assertWritePath("OFFERING", row);

  const cr = await changeRequests.submit(user, companyId, {
    entity: "OFFERING", entityId: id, operation: "PUBLISH", changes: {},
  });
  return { changeRequestId: cr.id };
}

/**
 * The explicit exception to "everything waits for admin approval": isActive and
 * sortOrder apply IMMEDIATELY, even on a published offering.
 *
 * They are operational controls, not content — hiding an offering changes no
 * price and no text, and un-hiding restores the same approved content. Making a
 * provider wait two days to pull a wrong price while customers act on it is a
 * bigger harm than any review gained. Both are audited so repeated
 * hide/unhide cycles are visible.
 */
export async function setVisibility(
  user: AuthUser,
  companyId: string,
  id: string,
  patch: { isActive?: boolean; sortOrder?: number },
): Promise<ApiOffering> {
  const row = await loadOwned(companyId, id);
  const updated = await prisma.offering.update({
    where: { id: row.id },
    data: {
      ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}),
      ...(patch.sortOrder !== undefined ? { sortOrder: patch.sortOrder } : {}),
    },
    include: TIER_INCLUDE,
  });
  await audit.record(user, {
    action: "offering.visibility",
    entity: "Offering",
    entityId: id,
    meta: { companyId, ...patch },
  });
  return serializeOffering(updated);
}

// ── Tiers ────────────────────────────────────────────────────────────────────

export interface TierInput {
  label: string;
  qtyMin?: number | null;
  qtyMax?: number | null;
  priceMin?: number | null;
  priceMax?: number | null;
  sortOrder?: number;
}

/**
 * Quantity bands must not overlap: with "1–3 rooms" and "3–5 rooms" both
 * matching a 3-room job, which price applies is a coin toss, and the customer
 * and the provider will each assume the one that suits them.
 */
export function assertNoTierOverlap(
  tiers: { qtyMin: number | null; qtyMax: number | null }[],
): void {
  const bounded = tiers
    .map((t) => ({ min: t.qtyMin ?? Number.NEGATIVE_INFINITY, max: t.qtyMax ?? Number.POSITIVE_INFINITY }))
    .sort((a, b) => a.min - b.min);

  for (let i = 1; i < bounded.length; i++) {
    if (bounded[i].min <= bounded[i - 1].max) {
      throw new ValidationError(
        "Quantity ranges overlap. Each tier must cover a distinct range.",
      );
    }
  }
}

export interface TierWriteResult {
  path: WritePath;
  offering: ApiOffering;
  changeRequestId?: string;
}

/**
 * Add a quantity band.
 *
 * Which path this takes is decided by the PARENT's publish state, because that is
 * what determines whether the new price is public:
 *
 *   parent is a draft     → the tier is part of content nobody has seen yet, and
 *                           it gets reviewed with the offering's PUBLISH request.
 *                           Written published so it goes live with its parent.
 *   parent is published   → this is a NEW public price. The row is written as a
 *                           draft (invisible to customers) and a PUBLISH request
 *                           is filed against the tier itself.
 *
 * The row is created either way so the provider can see what they built; only
 * `isPublished` decides whether a customer can be quoted from it.
 */
export async function addTier(
  user: AuthUser,
  companyId: string,
  offeringId: string,
  input: TierInput,
): Promise<TierWriteResult> {
  await assertCatalogEnabled(companyId);
  const row = await loadOwned(companyId, offeringId);
  const path = await assertWritePath("OFFERING", row);

  // Overlap is checked against the bands this tier will actually compete with.
  // A draft tier cannot be quoted from, so it must not block a published band —
  // and two pending drafts overlapping each other is the admin's call at review.
  const rivals = path === "review"
    ? row.tiers.filter((t) => t.isPublished)
    : row.tiers;
  assertNoTierOverlap([
    ...rivals.map((t) => ({ qtyMin: t.qtyMin, qtyMax: t.qtyMax })),
    { qtyMin: input.qtyMin ?? null, qtyMax: input.qtyMax ?? null },
  ]);

  const created = await prisma.offeringTier.create({
    data: {
      offeringId,
      label: input.label,
      qtyMin: input.qtyMin ?? null,
      qtyMax: input.qtyMax ?? null,
      priceMin: input.priceMin ?? null,
      priceMax: input.priceMax ?? null,
      sortOrder: input.sortOrder ?? row.tiers.length,
      isPublished: path === "direct",
    },
  });

  let changeRequestId: string | undefined;
  if (path === "review") {
    const cr = await changeRequests.submit(user, companyId, {
      entity: "OFFERING_TIER", entityId: created.id, operation: "PUBLISH", changes: {},
    });
    changeRequestId = cr.id;
  }

  return {
    path,
    offering: serializeOffering(await loadOwned(companyId, offeringId)),
    ...(changeRequestId ? { changeRequestId } : {}),
  };
}

/**
 * Remove a quantity band. A draft tier is the provider's own unreviewed content
 * and goes immediately; deleting a PUBLISHED one changes a live price list, so it
 * files a DELETE request and the band stays quotable until an admin acts.
 */
export async function removeTier(
  user: AuthUser,
  companyId: string,
  offeringId: string,
  tierId: string,
): Promise<TierWriteResult> {
  const row = await loadOwned(companyId, offeringId);
  const tier = row.tiers.find((t) => t.id === tierId);
  if (!tier) throw new NotFoundError("Tier");

  if (tier.isPublished) {
    const cr = await changeRequests.submit(user, companyId, {
      entity: "OFFERING_TIER", entityId: tierId, operation: "DELETE", changes: {},
    });
    return {
      path: "review",
      offering: serializeOffering(await loadOwned(companyId, offeringId)),
      changeRequestId: cr.id,
    };
  }

  await prisma.$transaction(async (tx) => {
    // entityId has no FK — a pending PUBLISH request for this draft would
    // otherwise outlive the row and 500 the admin queue when opened.
    await changeRequests.cancelPendingForEntity(tx as never, "OFFERING_TIER", tierId);
    await tx.offeringTier.delete({ where: { id: tierId } });
  });
  return { path: "direct", offering: serializeOffering(await loadOwned(companyId, offeringId)) };
}

// ── Bundle rules ─────────────────────────────────────────────────────────────

type BundleRow = {
  id: string; companyId: string; label: string | null;
  minItems: number; discountPercent: number; isActive: boolean; isPublished: boolean;
};

export function serializeBundleRule(b: BundleRow): ApiBundleRule {
  return {
    id: b.id, companyId: b.companyId, label: b.label,
    minItems: b.minItems, discountPercent: b.discountPercent,
    isActive: b.isActive, isPublished: b.isPublished,
  };
}

export async function listBundleRules(companyId: string): Promise<ApiBundleRule[]> {
  const rows = await prisma.bundleRule.findMany({
    where: { companyId },
    orderBy: { minItems: "asc" },
  });
  return rows.map(serializeBundleRule);
}

/** PUBLIC: only published + active rules can affect a customer's total. */
export async function listPublicBundleRules(companyId: string): Promise<ApiBundleRule[]> {
  const rows = await prisma.bundleRule.findMany({
    where: { companyId, isPublished: true, isActive: true },
    orderBy: { minItems: "asc" },
  });
  return rows.map(serializeBundleRule);
}

export async function createBundleRule(
  companyId: string,
  input: { label?: string | null; minItems: number; discountPercent: number },
): Promise<ApiBundleRule> {
  await assertCatalogEnabled(companyId);
  const created = await prisma.bundleRule.create({
    data: {
      companyId,
      label: input.label ?? null,
      minItems: input.minItems,
      discountPercent: input.discountPercent,
      isPublished: false,
    },
  });
  return serializeBundleRule(created);
}

// ── Admin ────────────────────────────────────────────────────────────────────

/**
 * Admin writes go straight through, published immediately — both a new
 * offering AND an edit to an existing one (draft or already-live). An admin
 * approving their own change request would be pure ceremony, and an admin
 * editing a provider's pending draft here IS the approval — there is nothing
 * left to review after the admin themselves just looked at and rewrote it.
 *
 * Any change request still pending against this offering is cancelled, not
 * left to linger: approving it later would either 409 (the drift check in
 * changeRequests.service catching that the row moved) or, worse, silently
 * re-apply stale content over what the admin just set. Neither is useful once
 * the admin has written the row directly.
 */
export async function adminUpsert(
  actor: AuthUser,
  companyId: string,
  id: string | null,
  input: OfferingInput,
): Promise<ApiOffering> {
  await assertCatalogEnabled(companyId);
  const data = {
    name: input.name,
    description: input.description ?? null,
    nameAr: input.nameAr ?? null,
    descriptionAr: input.descriptionAr ?? null,
    tags: input.tags ?? [],
    kind: (input.kind ?? "SERVICE") as never,
    pricingModel: (input.pricingModel ?? "RANGE") as never,
    priceMin: input.priceMin ?? null,
    priceMax: input.priceMax ?? null,
    unit: (input.unit as never) ?? null,
    minQty: input.minQty ?? null,
    image: input.image ?? null,
    note: input.note ?? null,
    isPublished: true,
    priceUpdatedAt: new Date(),
  };

  // Scoped by companyId on BOTH branches. The create branch always was; the
  // update branch matched on id alone, so a mismatched (companyId, id) pair
  // would have edited another company's offering — the caller is an admin, but
  // "trusted" is not the same as "cannot make a mistake", and every other write
  // in this file verifies ownership first.
  if (id) {
    const existing = await prisma.offering.findUnique({
      where: { id },
      select: { companyId: true },
    });
    if (!existing || existing.companyId !== companyId) throw new NotFoundError("Offering");
  }

  const row = id
    ? await prisma.offering.update({ where: { id }, data, include: TIER_INCLUDE })
    : await prisma.offering.create({ data: { ...data, companyId }, include: TIER_INCLUDE });

  if (id) {
    await prisma.changeRequest.updateMany({
      where: { entity: "OFFERING", entityId: id, status: "PENDING" },
      data: { status: "CANCELLED", reviewNote: "Superseded by a direct admin edit." },
    });
  }

  await audit.record(actor, {
    action: id ? "offering.update" : "offering.create",
    entity: "Offering",
    entityId: row.id,
    meta: { companyId },
  });
  return serializeOffering(row);
}

/**
 * Admin: delete an offering outright, regardless of publish state — no review,
 * same reasoning as adminUpsert. Any pending change request against it is
 * cancelled first so the admin queue never points at a row that no longer
 * exists (see the identical concern on the direct-delete branch of remove()).
 */
export async function adminRemove(actor: AuthUser, companyId: string, id: string): Promise<void> {
  const existing = await prisma.offering.findUnique({ where: { id }, select: { companyId: true } });
  if (!existing || existing.companyId !== companyId) throw new NotFoundError("Offering");

  await prisma.$transaction(async (tx) => {
    await changeRequests.cancelPendingForEntity(tx as never, "OFFERING", id);
    await tx.offering.delete({ where: { id } });
  });

  await audit.record(actor, {
    action: "offering.delete",
    entity: "Offering",
    entityId: id,
    meta: { companyId },
  });
}

// ── Category price reference (admin review aid) ──────────────────────────────

/** Below this many comparable offerings the median is statistically meaningless. */
export const MIN_REFERENCE_SAMPLE = 5;
/** Outside ±60% of the median, flag it for the admin to look at. */
export const REFERENCE_TOLERANCE = 0.6;

export interface PriceReference {
  available: boolean;
  reason?: "not_per_unit" | "insufficient_data";
  unit?: string;
  sampleSize?: number;
  min?: number;
  median?: number;
  max?: number;
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

/**
 * Reference prices for offerings comparable to this one.
 *
 * PER_UNIT ONLY, and only against the same unit. FIXED and RANGE offerings have
 * no unit, so the only available grouping would be "same company category" —
 * which puts "full apartment finishing" and "install one door" in the same
 * bucket. A median over that compares unrelated things and would flag perfectly
 * sane prices, and a warning that cries wolf gets ignored within a week.
 *
 * "Same company category" itself generalizes, now that a company may belong to
 * several: a peer is any OTHER company sharing at least one category with this
 * offering's company — the least-surprising analog of "same category" once
 * there's more than one to compare against.
 */
export async function priceReference(offering: {
  pricingModel: string;
  unit: string | null;
  companyId: string;
  id?: string;
}): Promise<PriceReference> {
  if (offering.pricingModel !== "PER_UNIT" || !offering.unit) {
    return { available: false, reason: "not_per_unit" };
  }

  const company = await prisma.company.findUnique({
    where: { id: offering.companyId },
    select: { categories: { select: { categoryId: true } } },
  });
  if (!company || company.categories.length === 0) return { available: false, reason: "insufficient_data" };
  const categoryIds = company.categories.map((cc) => cc.categoryId);

  const peers = await prisma.offering.findMany({
    where: {
      isPublished: true,
      isActive: true,
      pricingModel: "PER_UNIT",
      unit: offering.unit as never,
      priceMin: { not: null },
      company: { categories: { some: { categoryId: { in: categoryIds } } } },
      ...(offering.id ? { id: { not: offering.id } } : {}),
    },
    select: { priceMin: true },
  });

  const values = peers.map((p) => p.priceMin!).filter((v) => typeof v === "number");
  if (values.length < MIN_REFERENCE_SAMPLE) {
    return { available: false, reason: "insufficient_data", sampleSize: values.length };
  }

  return {
    available: true,
    unit: offering.unit,
    sampleSize: values.length,
    min: Math.min(...values),
    median: median(values),
    max: Math.max(...values),
  };
}

/** True when a price sits far enough from the median to be worth a second look. */
export function isPriceOutlier(price: number, ref: PriceReference): boolean {
  if (!ref.available || ref.median === undefined || ref.median === 0) return false;
  return Math.abs(price - ref.median) / ref.median > REFERENCE_TOLERANCE;
}
