// Audit logging for sensitive/destructive admin actions. record() is FAIL-OPEN:
// a logging failure must never break or fail the action it audits. list() backs
// the admin read endpoint.
import { prisma } from "@/lib/prisma";
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
  const page = Math.max(1, Math.trunc(query.page ?? 1) || 1);
  const rawSize = Math.trunc(query.pageSize ?? DEFAULT_PAGE_SIZE) || DEFAULT_PAGE_SIZE;
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, rawSize));

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
