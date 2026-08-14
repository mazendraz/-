// Business Control Center — Clients & CRM. Client is a phone-deduplicated
// aggregation of Leads (see schema.prisma's Client model comment) — NOT a
// customer login/account. The no-login lead/review/verify trust model is
// completely unchanged by this file.
import { prisma } from "@/lib/prisma";
import { clampPage, clampPageSize } from "@/lib/utils/paging";
import { serializeClient } from "@/lib/utils/serialize";
import type { ApiClient, ApiClientListQuery, ApiClientOverview, ApiPage } from "@/lib/apiTypes";

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

/**
 * Upsert the Client row for a just-created (or waitlist-converted) Lead, and
 * return its id so the caller can set Lead.clientId. Called from
 * leads.service.createLeadRecord on every new lead.
 *
 * NOT run inside the same db transaction as the lead insert: a lost race here
 * only means the client's displayed name/lastSeenAt lags by one request, never
 * data loss (the lead is still linked via the id resolved right after) — the
 * same "good enough, not a financial number" tolerance the rest of
 * leads.service already applies to its notification fan-out.
 */
export async function upsertClientForLead(phone: string, customerName: string): Promise<string> {
  const client = await prisma.client.upsert({
    where: { phone },
    create: { phone, name: customerName },
    update: { name: customerName, lastSeenAt: new Date() },
    select: { id: true },
  });
  return client.id;
}

export type ClientListQuery = ApiClientListQuery;

function clampPaging(query: { page?: number; pageSize?: number }): { page: number; pageSize: number } {
  return {
    page: clampPage(query.page),
    pageSize: clampPageSize(query.pageSize, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
  };
}

/** Admin: paginated client roster — Total Requests / Successful Services /
 *  Total Value / Last Active / Status, per the Clients & CRM mockup. */
export async function list(query: ClientListQuery): Promise<ApiPage<ApiClient>> {
  const search = query.search?.trim();
  const where = search
    ? {
        OR: [
          { name: { contains: search, mode: "insensitive" as const } },
          { phone: { contains: search, mode: "insensitive" as const } },
        ],
      }
    : {};

  const { page, pageSize } = clampPaging(query);
  const [total, clients] = await Promise.all([
    prisma.client.count({ where }),
    prisma.client.findMany({
      where,
      orderBy: { lastSeenAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);
  if (clients.length === 0) return { data: [], meta: { total, page, pageSize } };

  const ids = clients.map((c) => c.id);

  // Total requests per client — one GROUP BY, bounded to this page's clients.
  const requestCounts = await prisma.lead.groupBy({
    by: ["clientId"],
    where: { clientId: { in: ids } },
    _count: { _all: true },
  });
  const requestsByClient = new Map(requestCounts.map((r) => [r.clientId as string, r._count._all]));

  // Successful services + total value — verified completions for this page's
  // clients only. Small, bounded result set (this page's leads), so reducing
  // in JS here is well within the "server-side aggregation" bar the rest of
  // this codebase holds itself to (stats.service.ts) — a raw SQL GROUP BY
  // would do the same work with more code, not less risk, at this scale.
  const completions = await prisma.leadCompletion.findMany({
    where: { verifiedAt: { not: null }, lead: { clientId: { in: ids } } },
    select: { clientAmount: true, lead: { select: { clientId: true } } },
  });
  const successByClient = new Map<string, { count: number; value: number }>();
  for (const c of completions) {
    const clientId = c.lead.clientId;
    if (!clientId) continue;
    const entry = successByClient.get(clientId) ?? { count: 0, value: 0 };
    entry.count += 1;
    entry.value += c.clientAmount ?? 0;
    successByClient.set(clientId, entry);
  }

  const data = clients.map((c) =>
    serializeClient(c, {
      totalRequests: requestsByClient.get(c.id) ?? 0,
      successfulServices: successByClient.get(c.id)?.count ?? 0,
      totalValue: successByClient.get(c.id)?.value ?? 0,
    }),
  );
  return { data, meta: { total, page, pageSize } };
}

export interface ClientOverviewQuery {
  /** Trailing window (days) for newClients + retention — same shape as
   *  stats.service.ts's deltaDays. */
  deltaDays?: number;
}

const MAX_DELTA_DAYS = 90;

function clampDeltaDays(value: number | undefined): number {
  const n = Math.trunc(value ?? 30) || 30;
  return Math.min(MAX_DELTA_DAYS, Math.max(1, n));
}

/** Admin: the Clients & CRM screen's KPI row. */
export async function overview(query: ClientOverviewQuery): Promise<ApiClientOverview> {
  const deltaDays = clampDeltaDays(query.deltaDays);
  const dayMs = 86_400_000;
  const now = Date.now();
  const windowStart = new Date(now - deltaDays * dayMs);
  const priorStart = new Date(now - 2 * deltaDays * dayMs);

  const [totalClients, newCurrent, newPrevious, activeInCurrent, activeInPrevious, valueRows, totalRequestsWithClient] =
    await Promise.all([
      prisma.client.count(),
      prisma.client.count({ where: { firstSeenAt: { gte: windowStart } } }),
      prisma.client.count({ where: { firstSeenAt: { gte: priorStart, lt: windowStart } } }),
      prisma.lead.findMany({
        where: { createdAt: { gte: windowStart }, clientId: { not: null } },
        select: { clientId: true },
        distinct: ["clientId"],
      }),
      prisma.lead.findMany({
        where: { createdAt: { gte: priorStart, lt: windowStart }, clientId: { not: null } },
        select: { clientId: true },
        distinct: ["clientId"],
      }),
      prisma.leadCompletion.findMany({
        where: { verifiedAt: { not: null } },
        select: { clientAmount: true, lead: { select: { clientId: true } } },
      }),
      // All-time request count tied to a known client — "Requests per Client"
      // is a whole-platform average, not windowed (matches ApiClient.totalRequests'
      // own all-time scope on the per-row table).
      prisma.lead.count({ where: { clientId: { not: null } } }),
    ]);

  const currentIds = new Set(activeInCurrent.map((r) => r.clientId as string));
  const previousIds = new Set(activeInPrevious.map((r) => r.clientId as string));
  let retained = 0;
  for (const id of previousIds) if (currentIds.has(id)) retained += 1;
  const retentionRatePercent = previousIds.size > 0 ? Math.round((retained / previousIds.size) * 100) : 0;
  // A client's firstSeenAt is always set at the moment of their first-ever
  // lead (see upsertClientForLead), so newCurrent is always a subset of
  // currentIds — "returning" is simply everyone active this window who
  // wasn't new this window.
  const returningClients = Math.max(0, currentIds.size - newCurrent);

  const valueByClient = new Map<string, number>();
  let completedServicesTotal = 0;
  for (const row of valueRows) {
    const clientId = row.lead.clientId;
    if (!clientId) continue;
    completedServicesTotal += 1;
    valueByClient.set(clientId, (valueByClient.get(clientId) ?? 0) + (row.clientAmount ?? 0));
  }
  const values = [...valueByClient.values()];
  const avgLifetimeValue = values.length > 0 ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : 0;
  const avgRequestsPerClient = totalClients > 0 ? Math.round((totalRequestsWithClient / totalClients) * 10) / 10 : 0;

  return {
    totalClients,
    newClients: { current: newCurrent, previous: newPrevious },
    returningClients,
    retentionRatePercent,
    avgLifetimeValue,
    avgRequestsPerClient,
    completedServicesTotal,
  };
}
