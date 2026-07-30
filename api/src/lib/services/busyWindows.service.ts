// Scheduled unavailability. Layers on top of the existing manual busy switch —
// a company is unavailable if EITHER says so.
//
// Nothing is scheduled to run: "busy right now" is derived from these rows on
// every read, exactly like busyUntil already works. A window opens and closes by
// itself, and there is no job that can fall behind or die.
import { prisma } from "@/lib/prisma";
import type { AuthUser } from "@/lib/auth";
import { NotFoundError, ForbiddenError, ValidationError } from "@/lib/utils/errors";
import * as audit from "@/lib/services/audit.service";

export interface ApiBusyWindow {
  id: string;
  companyId: string;
  startsAt: number;
  /** null = open-ended, until someone closes it. */
  endsAt: number | null;
  note: string | null;
  createdByAdmin: boolean;
  createdAt: number;
}

export type BusyWindowRow = {
  id: string;
  companyId: string;
  startsAt: Date;
  endsAt: Date | null;
  note: string | null;
  createdByAdmin: boolean;
  createdAt: Date;
};

export function serializeBusyWindow(w: BusyWindowRow): ApiBusyWindow {
  return {
    id: w.id,
    companyId: w.companyId,
    startsAt: w.startsAt.getTime(),
    endsAt: w.endsAt?.getTime() ?? null,
    note: w.note,
    createdByAdmin: w.createdByAdmin,
    createdAt: w.createdAt.getTime(),
  };
}

// ── Overlap rules ────────────────────────────────────────────────────────────

/**
 * Does [aStart, aEnd) overlap [bStart, bEnd)? A null end means "forever".
 *
 * Half-open on purpose: a window ending at 17:00 and one starting at 17:00 do
 * not clash. Treating them as an overlap would stop a provider scheduling
 * back-to-back windows, which is the normal way to describe two consecutive
 * commitments with different notes.
 */
export function overlaps(
  aStart: Date, aEnd: Date | null,
  bStart: Date, bEnd: Date | null,
): boolean {
  const aEndMs = aEnd?.getTime() ?? Number.POSITIVE_INFINITY;
  const bEndMs = bEnd?.getTime() ?? Number.POSITIVE_INFINITY;
  return aStart.getTime() < bEndMs && bStart.getTime() < aEndMs;
}

/** A window is live when it has started and has not finished. */
export function isWindowActive(w: { startsAt: Date; endsAt: Date | null }, now = new Date()): boolean {
  return w.startsAt <= now && (w.endsAt == null || w.endsAt > now);
}

export interface BusyWindowInput {
  startsAt: number;
  endsAt?: number | null;
  note?: string | null;
}

const MAX_PAST_MS = 24 * 60 * 60 * 1000; // a day's grace for clock skew / "since yesterday"

// ── Reads ────────────────────────────────────────────────────────────────────

/**
 * Windows that still matter: currently running or yet to start. Finished ones
 * are history — nothing in the product reads them, and fetching them would grow
 * the hot list query without bound as the table ages.
 */
export function relevantWindowsWhere(now = new Date()) {
  return { OR: [{ endsAt: null }, { endsAt: { gt: now } }] };
}

export async function listForCompany(companyId: string): Promise<ApiBusyWindow[]> {
  const rows = await prisma.busyWindow.findMany({
    where: { companyId, ...relevantWindowsWhere() },
    orderBy: { startsAt: "asc" },
  });
  return rows.map(serializeBusyWindow);
}

/**
 * One query for a whole page of companies, grouped in memory.
 *
 * GET /api/companies is the hottest endpoint in the product and the frontend
 * asks for pageSize=100. A per-company lookup here would be 100 extra queries
 * per page load; this is one, whatever the page size.
 */
export async function windowsByCompany(
  companyIds: string[],
  now = new Date(),
): Promise<Map<string, BusyWindowRow[]>> {
  const byCompany = new Map<string, BusyWindowRow[]>();
  if (companyIds.length === 0) return byCompany;

  const rows = await prisma.busyWindow.findMany({
    where: { companyId: { in: companyIds }, ...relevantWindowsWhere(now) },
    orderBy: { startsAt: "asc" },
  });
  for (const row of rows) {
    const list = byCompany.get(row.companyId);
    if (list) list.push(row);
    else byCompany.set(row.companyId, [row]);
  }
  return byCompany;
}

// ── Writes ───────────────────────────────────────────────────────────────────

async function assertNoOverlap(
  companyId: string,
  startsAt: Date,
  endsAt: Date | null,
  ignoreId?: string,
): Promise<void> {
  const existing = await prisma.busyWindow.findMany({
    where: {
      companyId,
      ...relevantWindowsWhere(),
      ...(ignoreId ? { id: { not: ignoreId } } : {}),
    },
  });

  for (const w of existing) {
    // An existing open-ended window is skipped: creating a new open-ended window
    // closes it (see create()), so comparing against it would reject the very
    // operation that resolves the conflict.
    if (w.endsAt == null && endsAt == null) continue;
    if (overlaps(startsAt, endsAt, w.startsAt, w.endsAt)) {
      throw new ValidationError(
        "That overlaps a period you already have scheduled. Adjust the dates or remove the other one.",
      );
    }
  }
}

function parseInput(input: BusyWindowInput): { startsAt: Date; endsAt: Date | null } {
  const startsAt = new Date(input.startsAt);
  const endsAt = input.endsAt == null ? null : new Date(input.endsAt);

  if (Number.isNaN(startsAt.getTime())) throw new ValidationError("Invalid start date.");
  if (endsAt && Number.isNaN(endsAt.getTime())) throw new ValidationError("Invalid end date.");
  if (endsAt && endsAt <= startsAt) {
    throw new ValidationError("The end date must be after the start date.");
  }
  // Backdating slightly is legitimate ("I've been away since yesterday"); a
  // window starting last year is a typo, and it would silently mark the company
  // busy for a stretch nobody intended.
  if (startsAt.getTime() < Date.now() - MAX_PAST_MS) {
    throw new ValidationError("The start date can't be more than a day in the past.");
  }
  return { startsAt, endsAt };
}

export async function create(
  actor: AuthUser,
  companyId: string,
  input: BusyWindowInput,
  byAdmin: boolean,
): Promise<ApiBusyWindow> {
  const { startsAt, endsAt } = parseInput(input);

  // At most ONE open-ended window per company. An open window overlaps every
  // future window forever, so a second one would make scheduling impossible.
  // Closing the old one (rather than rejecting) matches the intent: "I'm
  // unavailable from now, ignore what I said before".
  if (endsAt == null) {
    await prisma.busyWindow.updateMany({
      where: { companyId, endsAt: null },
      data: { endsAt: new Date() },
    });
  }

  await assertNoOverlap(companyId, startsAt, endsAt);

  const created = await prisma.busyWindow.create({
    data: {
      companyId, startsAt, endsAt,
      note: input.note ?? null,
      createdByAdmin: byAdmin,
      createdById: actor.id,
    },
  });

  await audit.record(actor, {
    action: byAdmin ? "busy_window.admin_create" : "busy_window.create",
    entity: "BusyWindow",
    entityId: created.id,
    meta: { companyId, startsAt: startsAt.toISOString(), endsAt: endsAt?.toISOString() ?? null },
  });
  return serializeBusyWindow(created);
}

async function loadOwned(companyId: string, id: string): Promise<BusyWindowRow> {
  const row = await prisma.busyWindow.findUnique({ where: { id } });
  // Scoped by company, and a wrong id reads as "not found" rather than
  // "forbidden" — the endpoint never confirms another company's window exists.
  if (!row || row.companyId !== companyId) throw new NotFoundError("Busy window");
  return row;
}

export async function update(
  actor: AuthUser,
  companyId: string,
  id: string,
  input: BusyWindowInput,
  byAdmin: boolean,
): Promise<ApiBusyWindow> {
  const existing = await loadOwned(companyId, id);
  // An admin marking a company unavailable must not be undoable by that company.
  if (existing.createdByAdmin && !byAdmin) {
    throw new ForbiddenError("This period was set by the Al Assema team and can't be changed here.");
  }

  const { startsAt, endsAt } = parseInput(input);
  if (endsAt == null) {
    await prisma.busyWindow.updateMany({
      where: { companyId, endsAt: null, id: { not: id } },
      data: { endsAt: new Date() },
    });
  }
  await assertNoOverlap(companyId, startsAt, endsAt, id);

  const updated = await prisma.busyWindow.update({
    where: { id },
    data: { startsAt, endsAt, note: input.note ?? null },
  });
  await audit.record(actor, {
    action: "busy_window.update",
    entity: "BusyWindow", entityId: id,
    meta: { companyId },
  });
  return serializeBusyWindow(updated);
}

export async function remove(
  actor: AuthUser,
  companyId: string,
  id: string,
  byAdmin: boolean,
): Promise<void> {
  const existing = await loadOwned(companyId, id);
  if (existing.createdByAdmin && !byAdmin) {
    throw new ForbiddenError("This period was set by the Al Assema team and can't be removed here.");
  }
  await prisma.busyWindow.delete({ where: { id } });
  await audit.record(actor, {
    action: "busy_window.delete",
    entity: "BusyWindow", entityId: id,
    meta: { companyId },
  });
}
