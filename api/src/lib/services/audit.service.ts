// Audit logging for sensitive/destructive admin actions. record() is FAIL-OPEN:
// a logging failure must never break or fail the action it audits. list() backs
// the admin read endpoint.
import { prisma } from "@/lib/prisma";
import { clampPage, clampPageSize } from "@/lib/utils/paging";
import type { AuthUser } from "@/lib/auth";
import type { ApiAuditLog, ApiPage } from "@/lib/apiTypes";

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

export interface AuditEntry {
  action: string; // dot-namespaced, e.g. "company.delete"
  entity: string; // "Company" | "User" | "Lead" | "Category" | ...
  entityId: string;
  meta?: Record<string, unknown>; // extra context; never include secrets/PII
}

/** Record an admin action. Never throws — logging must not break the request. */
export async function record(actor: AuthUser, entry: AuditEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: actor.id,
        actorEmail: actor.email,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId,
        meta: entry.meta ? JSON.stringify(entry.meta) : null,
      },
    });
  } catch (err) {
    console.error(`[audit] failed to record ${entry.action} (${entry.entityId}):`, err);
  }
}

/**
 * Stand-in actor id for an event that happened with no authenticated user.
 * AuditLog.actorId is non-null, and a failed login has an attempted email and
 * nothing else — there is no id to record because that is the whole point.
 */
export const ANONYMOUS_ACTOR = "anonymous";

/** Authentication events worth a permanent record. */
export type AuthAuditAction =
  | "auth.login.success"
  | "auth.login.failure"
  | "auth.login.throttled"
  // Customer sign-in through an identity provider (Google / Apple). Kept
  // distinct from the staff `auth.login.*` events above: they are different
  // populations against different tables, and reading the trail is much harder
  // if a customer sign-in and an admin sign-in look alike.
  //   .created — first sign-in; a new CustomerUser row exists as of this event.
  //   .linked  — an EXISTING account gained a second provider. Worth its own
  //              action because it is the one flow that attaches a new way in
  //              to an account that already has requests attached to it.
  //   .blocked — verified by the provider, but refused here (see customerAuth).
  | "auth.customer.success"
  | "auth.customer.created"
  | "auth.customer.linked"
  | "auth.customer.blocked"
  // Password registrations. `.registered` is not a sign-in — the account is
  // inert until `.verified` follows it, and a burst of registrations with no
  // verifications after them is what planting accounts on other people's
  // addresses looks like from the log.
  | "auth.customer.registered"
  | "auth.customer.verified"
  | "auth.customer.failure"
  // A completed forgot-password flow — the account's password changed with no
  // one typing the OLD one. Worth its own action distinct from `.verified`:
  // that event means "an address was proven"; this means "a credential was
  // replaced," which is the more security-relevant fact to be able to find in
  // the log when a customer reports they didn't do this.
  | "auth.customer.password_reset"
  // A retired refresh token presented after its grace window — the only
  // explanation is a second holder. The session is revoked on sight; this is
  // the record of it, and a run of them is a compromised device, not noise.
  | "auth.customer.session.reuse"
  // Account deletion. Written BEFORE the row is removed, because afterwards
  // there is nothing left to name it by — and this is the event most likely to
  // be asked about months later.
  | "auth.customer.deleted";

/**
 * Record an AUTHENTICATION event.
 *
 * Separate from record() because that takes an AuthUser, and the events that
 * matter most here are exactly the ones where there isn't one.
 *
 * Why this exists: before the 2026-08-10 audit (finding M-06) the audit trail
 * covered admin CRUD thoroughly but held nothing at all about authentication —
 * no successful login, no failed one, no throttle trip. So the first question
 * incident response asks, "did anyone sign in as an admin that we can't account
 * for?", had no answer anywhere in the system.
 *
 * NEVER records the password, or any part of it. The email is the attempted
 * identifier and the IP is the source; both are standard security-log content and
 * both are needed to tell a typo from a spray.
 *
 * Same fail-open contract as record(): a logging failure must never turn a
 * successful login into an error, or a failed one into a 500.
 *
 * Volume note: a spray is bounded by the per-IP login limit (10/min), so this
 * cannot be used to inflate the table faster than that — and rows describing a
 * spray are the rows you want.
 */
export async function recordAuth(entry: {
  action: AuthAuditAction;
  /** The email that was ATTEMPTED — not necessarily one that exists. */
  email: string;
  /** Set only on success, where a real user was resolved. */
  userId?: string | null;
  ip?: string;
  meta?: Record<string, unknown>;
}): Promise<void> {
  try {
    const actorId = entry.userId ?? ANONYMOUS_ACTOR;
    await prisma.auditLog.create({
      data: {
        actorId,
        actorEmail: entry.email,
        action: entry.action,
        entity: "Auth",
        entityId: actorId,
        meta: JSON.stringify({ ip: entry.ip ?? null, ...(entry.meta ?? {}) }),
      },
    });
  } catch (err) {
    console.error(`[audit] failed to record ${entry.action}:`, err);
  }
}

interface AuditRow {
  id: string;
  actorId: string;
  actorEmail: string;
  action: string;
  entity: string;
  entityId: string;
  meta: string | null;
  createdAt: Date;
}

function serialize(r: AuditRow): ApiAuditLog {
  let meta: Record<string, unknown> | null = null;
  if (r.meta) {
    try {
      meta = JSON.parse(r.meta) as Record<string, unknown>;
    } catch {
      meta = null;
    }
  }
  return {
    id: r.id,
    actorId: r.actorId,
    actorEmail: r.actorEmail,
    action: r.action,
    entity: r.entity,
    entityId: r.entityId,
    meta,
    createdAt: r.createdAt.getTime(),
  };
}

export interface AuditListQuery {
  page?: number;
  pageSize?: number;
  entity?: string;
  action?: string;
}

/** Admin: paginated audit log, newest first. */
export async function list(query: AuditListQuery): Promise<ApiPage<ApiAuditLog>> {
  const page = clampPage(query.page);
  const pageSize = clampPageSize(query.pageSize, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);

  const where = {
    ...(query.entity ? { entity: query.entity } : {}),
    ...(query.action ? { action: query.action } : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);
  return { data: rows.map(serialize), meta: { total, page, pageSize } };
}
