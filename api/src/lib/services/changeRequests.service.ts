// Provider edits that need admin approval before they go live.
//
// DELIBERATELY GENERIC — Feature B (Offerings / tiers / bundle rules) reuses this
// service and the same admin review screen instead of growing a second approval
// system. Only COMPANY is wired up in this phase; see ENTITY_DISPATCH.
import { isDeepStrictEqual } from "node:util";
import { prisma } from "@/lib/prisma";
import type { AuthUser } from "@/lib/auth";
import type { ApiPage } from "@/lib/apiTypes";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/utils/errors";
import type {
  ChangeEntity,
  ChangeOperation,
  ChangeRequestStatus,
} from "@/generated/prisma/enums";
import type { InputJsonValue } from "@/generated/prisma/internal/prismaNamespace";
import * as audit from "@/lib/services/audit.service";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

// ── Field allowlists ─────────────────────────────────────────────────────────
// Approval ultimately runs `prisma[entity].update({ data: changes })` with data
// the PROVIDER supplied. Without a per-entity allowlist that is textbook mass
// assignment: send `{ verified: true }` or `{ companyId: "<someone else>" }` and
// it sails through — inside the very feature whose job is to gate provider edits.
//
// This is an ALLOWLIST, not a denylist: anything not named here is rejected, so a
// column added to the schema later is closed by default rather than open.
export const EDITABLE_FIELDS: Record<ChangeEntity, readonly string[]> = {
  COMPANY: [
    "name", "tagline", "about", "logo", "cover", "gallery",
    "phone", "whatsapp", "email", "location",
    "yearsExperience", "responseTime", "badges",
    "metaTitle", "metaDescription",
  ],
  // Wired up in Feature B (phase 3) — listed now so the shape is visible, but
  // ENTITY_DISPATCH rejects these entities until their models exist.
  OFFERING: [
    "name", "description", "kind", "pricingModel",
    "priceMin", "priceMax", "unit", "minQty", "image", "note",
  ],
  // `sortOrder` is intentionally absent: it is display ordering, so it takes the
  // same immediate-write exception as Offering.sortOrder (see Feature B).
  OFFERING_TIER: ["label", "qtyMin", "qtyMax", "priceMin", "priceMax"],
  BUNDLE_RULE: ["label", "minItems", "discountPercent"],
} as const;

// Notable omissions on COMPANY, all deliberate:
//   slug, categoryIds, status, featured, verified, rating, reviewCount,
//   ratingOverridden, completedProjects, verifiedSince → admin-only trust signals
//   busy / busyUntil / busyNote  → provider already controls these immediately via
//                                  /api/provider/availability; queuing them behind
//                                  review would make "I'm unavailable" take days
//   telegram*                    → auth material, never provider-writable
//   services                     → moves to Offerings in Feature B

/**
 * Which Prisma delegate each entity maps to.
 *
 * All four are wired as of Feature B. Keeping this as an explicit map (rather
 * than lowercasing the enum) means adding an entity is a deliberate edit here,
 * not something that happens by accident when someone adds an enum value.
 */
const ENTITY_DISPATCH = {
  COMPANY: "company",
  OFFERING: "offering",
  OFFERING_TIER: "offeringTier",
  BUNDLE_RULE: "bundleRule",
} as const satisfies Record<ChangeEntity, string>;

type EntityDelegate = {
  findUnique: (args: { where: { id: string } }) => Promise<Record<string, unknown> | null>;
  update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<unknown>;
  delete: (args: { where: { id: string } }) => Promise<unknown>;
};

/** The Prisma delegate for an entity, off `prisma` or a transaction client. */
function delegateFor(
  client: Record<string, unknown>,
  entity: ChangeEntity,
): EntityDelegate {
  return client[ENTITY_DISPATCH[entity]] as unknown as EntityDelegate;
}

function assertEntitySupported(entity: ChangeEntity): void {
  if (!ENTITY_DISPATCH[entity]) {
    throw new ValidationError(
      `Change requests for ${entity} aren't available yet.`,
      { entity: ["ENTITY_NOT_SUPPORTED"] },
    );
  }
}

/**
 * Reject any key outside the entity's allowlist.
 *
 * Called at BOTH submit and approve time on purpose. A request can sit in the
 * queue for days; if the allowlist is tightened in between, a stored request must
 * not be able to write a field that is no longer permitted.
 */
export function assertEditableFields(entity: ChangeEntity, changes: Record<string, unknown>): void {
  const allowed = EDITABLE_FIELDS[entity];
  const rejected = Object.keys(changes).filter((k) => !allowed.includes(k));
  if (rejected.length > 0) {
    throw new ValidationError(
      `These fields can't be changed: ${rejected.join(", ")}`,
      { changes: rejected.map((k) => `"${k}" is not an editable field`) },
    );
  }
  if (Object.keys(changes).length === 0) {
    throw new ValidationError("No changes were submitted.");
  }
}

// ── Serialization ────────────────────────────────────────────────────────────

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
  /**
   * Fields whose live value drifted from `snapshot` since submission — i.e. an
   * admin edited them directly while the request waited. Present only on the
   * detail read, where the live row is loaded.
   */
  conflicts?: string[];
  /** True when the target row no longer exists (e.g. company deleted). */
  entityMissing?: boolean;
}

type ChangeRequestRow = {
  id: string;
  companyId: string;
  entity: ChangeEntity;
  entityId: string;
  operation: ChangeOperation;
  submittedById: string;
  changes: unknown;
  snapshot: unknown;
  note: string | null;
  status: ChangeRequestStatus;
  reviewedById: string | null;
  reviewedAt: Date | null;
  reviewNote: string | null;
  createdAt: Date;
  updatedAt: Date;
  company?: { name: string } | null;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * Prisma's Json input type is structural and rejects `Record<string, unknown>`
 * even though the value is a plain JSON object. Zod already guarantees the shape
 * at the route boundary (`z.record(z.string(), z.unknown())`), so this is a
 * type-level bridge, not a runtime assumption.
 */
function asJson(value: Record<string, unknown>): InputJsonValue {
  return value as InputJsonValue;
}

function serialize(r: ChangeRequestRow): ApiChangeRequest {
  return {
    id: r.id,
    companyId: r.companyId,
    ...(r.company ? { companyName: r.company.name } : {}),
    entity: r.entity,
    entityId: r.entityId,
    operation: r.operation,
    submittedById: r.submittedById,
    changes: asRecord(r.changes),
    snapshot: asRecord(r.snapshot),
    note: r.note,
    status: r.status,
    reviewedById: r.reviewedById,
    reviewedAt: r.reviewedAt?.getTime() ?? null,
    reviewNote: r.reviewNote,
    createdAt: r.createdAt.getTime(),
    updatedAt: r.updatedAt.getTime(),
  };
}

// ── Conflict detection ───────────────────────────────────────────────────────

/**
 * Fields an admin changed directly after the provider submitted.
 *
 * Uses a DEEP comparison. `gallery` and `badges` are `String[]`, and `["a"] !==
 * ["a"]` is always true because arrays compare by reference — with `!==` every
 * review containing a gallery would be flagged "changed since submission" when
 * nothing changed. The admin learns to ignore the warning within a week, and at
 * that point it is noise that actively hides the real conflicts.
 */
export function findConflicts(
  snapshot: Record<string, unknown>,
  live: Record<string, unknown>,
): string[] {
  return Object.keys(snapshot).filter((k) => !isDeepStrictEqual(snapshot[k], live[k]));
}

/** Current values of exactly the fields a request touches. */
function snapshotOf(row: Record<string, unknown>, fields: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) out[f] = row[f] ?? null;
  return out;
}

async function loadEntityRow(
  entity: ChangeEntity,
  entityId: string,
): Promise<Record<string, unknown> | null> {
  assertEntitySupported(entity);
  return delegateFor(prisma as unknown as Record<string, unknown>, entity)
    .findUnique({ where: { id: entityId } });
}

/**
 * The company that owns a row, for permission checks. COMPANY rows ARE the
 * company; OfferingTier reaches its company through its parent Offering.
 */
async function ownerCompanyId(entity: ChangeEntity, row: Record<string, unknown>): Promise<string | null> {
  if (entity === "COMPANY") return row.id as string;
  if (entity === "OFFERING_TIER") {
    const parent = await prisma.offering.findUnique({
      where: { id: row.offeringId as string },
      select: { companyId: true },
    });
    return parent?.companyId ?? null;
  }
  return (row.companyId as string) ?? null;
}

// ── Provider: submit / merge ─────────────────────────────────────────────────

export interface SubmitInput {
  entity: ChangeEntity;
  entityId: string;
  operation?: ChangeOperation;
  changes: Record<string, unknown>;
  note?: string;
}

/**
 * File a change request, MERGING into any existing pending one for the same
 * entity rather than replacing it.
 *
 * Replacing would silently drop earlier edits: "change phone, submit; change
 * about, submit" must end with one request containing BOTH, not one that lost the
 * phone change without telling anyone.
 */
export async function submit(
  user: AuthUser,
  companyId: string,
  input: SubmitInput,
): Promise<ApiChangeRequest> {
  assertEntitySupported(input.entity);

  const operation = input.operation ?? "UPDATE";

  const live = await loadEntityRow(input.entity, input.entityId);
  if (!live) throw new NotFoundError("Entity");

  // Ownership: a provider may only file requests against their own records.
  const owner = await ownerCompanyId(input.entity, live);
  if (owner !== companyId) {
    throw new ValidationError("You can only edit your own records.");
  }

  // PUBLISH and DELETE carry no field data — the row already holds its content,
  // and the request is about its lifecycle, not its values.
  if (operation === "UPDATE") {
    assertEditableFields(input.entity, input.changes);
  } else if (Object.keys(input.changes).length > 0) {
    throw new ValidationError(`A ${operation} request must not carry field changes.`);
  }

  try {
    const created = await prisma.$transaction(async (tx) => {
      const existing = await tx.changeRequest.findFirst({
        where: { entity: input.entity, entityId: input.entityId, status: "PENDING" },
      });

      // ORDER MATTERS. The partial unique index covers status = 'PENDING', so
      // inserting before cancelling would raise a unique violation on every
      // follow-up edit and the merge path would never work at all.
      const merged = existing
        ? { ...asRecord(existing.changes), ...input.changes }
        : input.changes;

      if (existing) {
        await tx.changeRequest.update({
          where: { id: existing.id },
          data: {
            status: "CANCELLED",
            reviewNote: "Superseded by a newer submission (merged).",
          },
        });
      }

      // Snapshot from the LIVE row, not the old request's snapshot — conflict
      // detection should measure drift from the most recent real state.
      //
      // For PUBLISH the snapshot covers the ENTITY'S WHOLE editable surface, not
      // just some changed fields: approval means "publish this content", so the
      // integrity check at approve time has to cover everything the admin saw.
      const snapshotFields = operation === "PUBLISH"
        ? [...EDITABLE_FIELDS[input.entity]]
        : Object.keys(merged);

      return tx.changeRequest.create({
        data: {
          companyId,
          entity: input.entity,
          entityId: input.entityId,
          operation,
          submittedById: user.id,
          changes: asJson(merged),
          snapshot: asJson(snapshotOf(live, snapshotFields)),
          note: input.note ?? null,
        },
        include: { company: { select: { name: true } } },
      });
    });
    return serialize(created);
  } catch (err) {
    // Losing the race against a concurrent submit is not a 500 — it means the
    // other request won, and retrying will merge into it.
    if (isUniqueViolation(err)) {
      throw new ConflictError(
        "Another edit for this record was submitted at the same time. Reload and try again.",
      );
    }
    throw err;
  }
}

function isUniqueViolation(err: unknown): boolean {
  return (
    !!err &&
    typeof err === "object" &&
    "code" in err &&
    (err as { code: unknown }).code === "P2002"
  );
}

/** Provider cancels their own pending request. */
export async function cancel(companyId: string, id: string): Promise<ApiChangeRequest> {
  const row = await prisma.changeRequest.findUnique({ where: { id } });
  if (!row || row.companyId !== companyId) throw new NotFoundError("Change request");
  if (row.status !== "PENDING") {
    throw new ValidationError("This request has already been reviewed.");
  }
  const updated = await prisma.changeRequest.update({
    where: { id },
    data: { status: "CANCELLED", reviewNote: "Withdrawn by the provider." },
    include: { company: { select: { name: true } } },
  });
  return serialize(updated);
}

/**
 * Cancel every pending request targeting an entity that is being deleted.
 *
 * `entityId` is a plain string with no foreign key, so deleting the target row
 * leaves the request dangling: the admin opens the queue, approves it, and the
 * update hits a row that no longer exists. MUST be called inside the same
 * transaction as the delete.
 *
 * (Deleting a Company is already covered by the FK cascade on companyId — this
 * exists for the entities Feature B adds, whose ids are not the company id.)
 */
export async function cancelPendingForEntity(
  tx: { changeRequest: { updateMany: (args: unknown) => Promise<{ count: number }> } },
  entity: ChangeEntity,
  entityId: string,
): Promise<number> {
  const { count } = await tx.changeRequest.updateMany({
    where: { entity, entityId, status: "PENDING" },
    data: { status: "CANCELLED", reviewNote: "The record was deleted." },
  });
  return count;
}

// ── Reads ────────────────────────────────────────────────────────────────────

export interface ListQuery {
  page?: number;
  pageSize?: number;
  entity?: ChangeEntity;
  status?: ChangeRequestStatus;
  companyId?: string;
}

export async function list(query: ListQuery): Promise<ApiPage<ApiChangeRequest>> {
  const page = Math.max(1, Math.trunc(query.page ?? 1) || 1);
  const rawSize = Math.trunc(query.pageSize ?? DEFAULT_PAGE_SIZE) || DEFAULT_PAGE_SIZE;
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, rawSize));

  const where = {
    ...(query.entity ? { entity: query.entity } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.companyId ? { companyId: query.companyId } : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.changeRequest.count({ where }),
    prisma.changeRequest.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { company: { select: { name: true } } },
    }),
  ]);
  return { data: rows.map(serialize), meta: { total, page, pageSize } };
}

export async function countPending(companyId?: string): Promise<number> {
  return prisma.changeRequest.count({
    where: { status: "PENDING", ...(companyId ? { companyId } : {}) },
  });
}

/** Detail view: the request plus conflict markers against the live row. */
export async function getById(id: string): Promise<ApiChangeRequest> {
  const row = await prisma.changeRequest.findUnique({
    where: { id },
    include: { company: { select: { name: true } } },
  });
  if (!row) throw new NotFoundError("Change request");

  const result = serialize(row);
  const live = await loadEntityRow(row.entity, row.entityId).catch(() => null);
  if (!live) {
    // The admin screen must say so plainly rather than throwing on open.
    result.entityMissing = true;
    result.conflicts = [];
    return result;
  }
  result.conflicts = findConflicts(result.snapshot, live);
  return result;
}

/** Provider view: their company's pending requests. */
export async function listForCompany(companyId: string): Promise<ApiChangeRequest[]> {
  const rows = await prisma.changeRequest.findMany({
    where: { companyId },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  return rows.map(serialize);
}

// ── Admin: approve / reject ──────────────────────────────────────────────────

export interface ReviewInput {
  action: "approve" | "reject";
  reviewNote?: string;
  /**
   * Partial approval: apply only these fields, reject the rest.
   *
   * KNOWN LIMIT — this works at whole-field granularity. `gallery` is one field
   * holding an array, so it is accepted or rejected as a unit; you cannot reject
   * a single image. Splitting gallery into its own rows would be the fix, and
   * that is out of scope here.
   */
  fields?: string[];
}

export interface ReviewResult {
  request: ApiChangeRequest;
  applied: string[];
  skipped: string[];
}

export async function review(
  actor: AuthUser,
  id: string,
  input: ReviewInput,
): Promise<ReviewResult> {
  const row = await prisma.changeRequest.findUnique({ where: { id } });
  if (!row) throw new NotFoundError("Change request");
  if (row.status !== "PENDING") {
    throw new ValidationError("This request has already been reviewed.");
  }

  const changes = asRecord(row.changes);

  if (input.action === "reject") {
    const updated = await prisma.changeRequest.update({
      where: { id },
      data: {
        status: "REJECTED",
        reviewedById: actor.id,
        reviewedAt: new Date(),
        reviewNote: input.reviewNote ?? null,
      },
      include: { company: { select: { name: true } } },
    });
    await audit.record(actor, {
      action: "company.change_request.reject",
      entity: "ChangeRequest",
      entityId: id,
      meta: { companyId: row.companyId, fields: Object.keys(changes) },
    });
    return { request: serialize(updated), applied: [], skipped: Object.keys(changes) };
  }

  // ── approve ──
  assertEntitySupported(row.entity);

  const snapshot = asRecord(row.snapshot);

  // ── PUBLISH: make an existing draft public for the first time ──────────────
  // No field data is applied — the row already holds its content. What matters
  // is that the content is STILL what the admin reviewed.
  if (row.operation === "PUBLISH") {
    const updated = await prisma.$transaction(async (tx) => {
      const target = await delegateFor(tx as unknown as Record<string, unknown>, row.entity)
        .findUnique({ where: { id: row.entityId } });
      if (!target) throw new NotFoundError("Record");

      // Second line of defence behind the draft lock. The lock stops the normal
      // path; this closes the race between "check the lock" and "write", and it
      // is the only thing that guarantees what gets published is what was shown.
      const drifted = findConflicts(snapshot, target);
      if (drifted.length > 0) {
        throw new ConflictError(
          `The draft changed after it was submitted (${drifted.join(", ")}). ` +
            `Re-open it to review the current content before publishing.`,
        );
      }

      await delegateFor(tx as unknown as Record<string, unknown>, row.entity)
        .update({ where: { id: row.entityId }, data: { isPublished: true } });

      return tx.changeRequest.update({
        where: { id },
        data: {
          status: "APPROVED", reviewedById: actor.id,
          reviewedAt: new Date(), reviewNote: input.reviewNote ?? null,
        },
        include: { company: { select: { name: true } } },
      });
    });

    await audit.record(actor, {
      action: "change_request.publish.approve",
      entity: "ChangeRequest", entityId: id,
      meta: { companyId: row.companyId, entity: row.entity, entityId: row.entityId },
    });
    return { request: serialize(updated), applied: [], skipped: [] };
  }

  // ── DELETE: remove a published row ─────────────────────────────────────────
  if (row.operation === "DELETE") {
    const updated = await prisma.$transaction(async (tx) => {
      const target = await delegateFor(tx as unknown as Record<string, unknown>, row.entity)
        .findUnique({ where: { id: row.entityId } });
      if (!target) throw new NotFoundError("Record");

      await delegateFor(tx as unknown as Record<string, unknown>, row.entity)
        .delete({ where: { id: row.entityId } });

      // Any OTHER request still pointing at this row is now unfulfillable —
      // entityId has no foreign key, so nothing else would clean them up.
      await cancelPendingForEntity(tx as never, row.entity, row.entityId);

      return tx.changeRequest.update({
        where: { id },
        data: {
          status: "APPROVED", reviewedById: actor.id,
          reviewedAt: new Date(), reviewNote: input.reviewNote ?? null,
        },
        include: { company: { select: { name: true } } },
      });
    });

    await audit.record(actor, {
      action: "change_request.delete.approve",
      entity: "ChangeRequest", entityId: id,
      meta: { companyId: row.companyId, entity: row.entity, entityId: row.entityId },
    });
    return { request: serialize(updated), applied: [], skipped: [] };
  }

  // ── UPDATE: apply the changed fields ───────────────────────────────────────
  // Second defence. The allowlist may have been tightened after this request was
  // stored, and a queued request must never be a way around the current rules.
  assertEditableFields(row.entity, changes);

  const selected = input.fields?.length ? input.fields : Object.keys(changes);
  const unknownFields = selected.filter((f) => !(f in changes));
  if (unknownFields.length > 0) {
    throw new ValidationError(
      `These fields aren't part of this request: ${unknownFields.join(", ")}`,
    );
  }

  const applied = selected;
  const skipped = Object.keys(changes).filter((k) => !selected.includes(k));
  const data: Record<string, unknown> = {};
  for (const f of applied) data[f] = changes[f];
  // Re-check the narrowed payload: `fields` comes from the request body too.
  assertEditableFields(row.entity, data);

  // A price edit refreshes priceUpdatedAt, which drives the "prices last updated
  // N days ago" nudge on the public profile.
  if (row.entity === "OFFERING" && PRICE_FIELDS.some((f) => f in data)) {
    data.priceUpdatedAt = new Date();
  }

  const updated = await prisma.$transaction(async (tx) => {
    const target = await delegateFor(tx as unknown as Record<string, unknown>, row.entity)
      .findUnique({ where: { id: row.entityId } });
    if (!target) throw new NotFoundError("Record");

    await delegateFor(tx as unknown as Record<string, unknown>, row.entity)
      .update({ where: { id: row.entityId }, data });

    return tx.changeRequest.update({
      where: { id },
      data: {
        status: "APPROVED",
        reviewedById: actor.id,
        reviewedAt: new Date(),
        reviewNote: input.reviewNote ?? null,
      },
      include: { company: { select: { name: true } } },
    });
  });

  await audit.record(actor, {
    action: row.entity === "COMPANY"
      ? "company.change_request.approve"
      : "change_request.update.approve",
    entity: "ChangeRequest",
    entityId: id,
    meta: { companyId: row.companyId, entity: row.entity, applied, skipped },
  });

  return { request: serialize(updated), applied, skipped };
}

/** Price-bearing fields — touching any of them refreshes priceUpdatedAt. */
const PRICE_FIELDS = ["priceMin", "priceMax", "pricingModel", "unit", "minQty"] as const;
