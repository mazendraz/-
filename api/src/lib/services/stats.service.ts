// Lead aggregates for the admin and provider dashboards.
//
// ── Why this exists ───────────────────────────────────────────────────────────
// The dashboards used to compute every KPI, chart and leaderboard in the browser
// from the lead list they had already hydrated — and that list is ONE PAGE, capped
// at 100 rows (leads.service MAX_PAGE_SIZE). So the moment a company passed 100
// leads the Overview quietly stopped counting: "total" froze at 100, the
// conversion rate was a percentage of the wrong denominator, and the 14-day trend
// only saw whatever happened to be in that page. The Leads tab, which paginates
// server-side, showed the true total right next to it.
//
// Aggregates have to be computed where the whole table is. Everything here is a
// COUNT or a GROUP BY — no lead rows are returned, so the response stays a few
// hundred bytes no matter how large the table gets.
//
// ── Buckets are Cairo-local, not UTC ──────────────────────────────────────────
// "Leads today" has to mean the day the reader is living in. Grouping by UTC
// would move the boundary two or three hours into the previous evening, so a lead
// taken at 1am Cairo would land on yesterday's bar. Postgres does the conversion
// (AT TIME ZONE handles the DST switch on its own), so the client never has to
// guess and two people in different timezones see the same chart.
import { prisma } from "@/lib/prisma";
import { LeadStatus } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { leadStatusToLabel } from "@/lib/utils/serialize";
import type { ApiLeadStats, ApiLeadStatus } from "@/lib/apiTypes";

/** The product's home timezone. Bucket boundaries are resolved in it. */
const TZ = "Africa/Cairo";

/** Caps so a hand-written query string can't ask for a thousand buckets. */
const MAX_DAYS = 90;
const MAX_MONTHS = 24;
const MAX_COMPANIES = 10;

export interface StatsQuery {
  /** Days in the daily trend, inclusive of today. */
  days?: number;
  /** Calendar months in the monthly bars, inclusive of this one. */
  months?: number;
  /** Trailing window for the KPI delta (current vs the equal window before it). */
  deltaDays?: number;
}

function clamp(value: number | undefined, fallback: number, max: number): number {
  const n = Math.trunc(value ?? fallback) || fallback;
  return Math.min(max, Math.max(1, n));
}

type BucketRow = { bucket: Date; count: bigint };

/**
 * Counts per Cairo-local day or month, as a dense series ending today.
 *
 * Dense on purpose: the query only returns days that HAVE leads, and a chart fed
 * a sparse series draws a line straight from Monday to Friday as though the quiet
 * days never existed. Zero-filling here keeps that decision out of every caller.
 */
async function bucketSeries(
  where: Prisma.LeadWhereInput,
  unit: "day" | "month",
  periods: number,
): Promise<{ date: string; count: number }[]> {
  const companyId = where.companyId as string | undefined;

  // date_trunc over a timestamptz needs the zone applied on the way in AND back
  // out, or the truncated value is reinterpreted as UTC and drifts by the offset.
  const rows = await prisma.$queryRaw<BucketRow[]>`
    SELECT date_trunc(${unit}, "createdAt" AT TIME ZONE ${TZ}) AT TIME ZONE ${TZ} AS bucket,
           COUNT(*)::bigint AS count
    FROM "Lead"
    WHERE (${companyId ?? null}::text IS NULL OR "companyId" = ${companyId ?? null}::text)
      AND "createdAt" >= (date_trunc(${unit}, now() AT TIME ZONE ${TZ})
                          - ${`${periods - 1} ${unit}s`}::interval) AT TIME ZONE ${TZ}
    GROUP BY 1
  `;

  const counts = new Map<string, number>();
  for (const r of rows) counts.set(keyOf(r.bucket, unit), Number(r.count));

  // Walk the axis in Cairo terms so the emitted keys line up with the grouping.
  const out: { date: string; count: number }[] = [];
  const now = cairoParts(new Date());
  for (let i = periods - 1; i >= 0; i -= 1) {
    const key =
      unit === "day"
        ? isoDay(addDays(now, -i))
        : isoMonth(addMonths(now, -i));
    out.push({ date: key, count: counts.get(key) ?? 0 });
  }
  return out;
}

// ── Cairo-local date arithmetic ───────────────────────────────────────────────
// Plain {y,m,d} triples rather than Date objects: the process timezone is not
// necessarily Cairo, and doing this with Date would silently reintroduce the
// offset bug the SQL above exists to avoid.
type Parts = { y: number; m: number; d: number };

function cairoParts(at: Date): Parts {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const [y, m, d] = fmt.format(at).split("-").map(Number);
  return { y: y!, m: m!, d: d! };
}

function addDays(p: Parts, delta: number): Parts {
  const t = Date.UTC(p.y, p.m - 1, p.d) + delta * 86_400_000;
  const dt = new Date(t);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

function addMonths(p: Parts, delta: number): Parts {
  const total = p.y * 12 + (p.m - 1) + delta;
  return { y: Math.floor(total / 12), m: (total % 12) + 1, d: 1 };
}

const pad = (n: number) => String(n).padStart(2, "0");
const isoDay = (p: Parts) => `${p.y}-${pad(p.m)}-${pad(p.d)}`;
const isoMonth = (p: Parts) => `${p.y}-${pad(p.m)}`;

function keyOf(bucket: Date, unit: "day" | "month"): string {
  const p = cairoParts(bucket);
  return unit === "day" ? isoDay(p) : isoMonth(p);
}

// ── Status counts ─────────────────────────────────────────────────────────────

const ALL_STATUSES = Object.values(LeadStatus) as LeadStatus[];

async function statusCounts(
  where: Prisma.LeadWhereInput,
): Promise<Record<ApiLeadStatus, number>> {
  const rows = await prisma.lead.groupBy({
    by: ["status"],
    where,
    _count: { _all: true },
  });
  // Every status present with an explicit 0 — a missing key would force each
  // caller to guard, and "no cancelled leads" is a real answer worth stating.
  const out = {} as Record<ApiLeadStatus, number>;
  for (const s of ALL_STATUSES) out[leadStatusToLabel(s)] = 0;
  for (const r of rows) out[leadStatusToLabel(r.status)] = r._count._all;
  return out;
}

// ── Per-company breakdown (admin only) ────────────────────────────────────────

async function byCompany(limit: number): Promise<ApiLeadStats["byCompany"]> {
  const grouped = await prisma.lead.groupBy({
    by: ["companyId"],
    _count: { _all: true },
    orderBy: { _count: { companyId: "desc" } },
    take: limit,
  });
  if (grouped.length === 0) return [];

  const ids = grouped.map((g) => g.companyId);
  // Completed counts for the same companies, so conversion is computed over the
  // full table rather than whatever page the browser happened to hold.
  const completed = await prisma.lead.groupBy({
    by: ["companyId"],
    where: { companyId: { in: ids }, status: LeadStatus.COMPLETED },
    _count: { _all: true },
  });
  const completedBy = new Map(completed.map((c) => [c.companyId, c._count._all]));

  const companies = await prisma.company.findMany({
    where: { id: { in: ids } },
    select: { id: true, slug: true, name: true, rating: true, logo: true },
  });
  const byId = new Map(companies.map((c) => [c.id, c]));

  return grouped.flatMap((g) => {
    const company = byId.get(g.companyId);
    if (!company) return []; // deleted mid-query
    const leads = g._count._all;
    const done = completedBy.get(g.companyId) ?? 0;
    return [{
      companyId: company.id,
      companySlug: company.slug,
      companyName: company.name,
      logo: company.logo,
      rating: company.rating,
      leads,
      completed: done,
      conversion: leads ? Math.round((done / leads) * 100) : 0,
    }];
  });
}

// ── Entry points ──────────────────────────────────────────────────────────────

async function build(
  where: Prisma.LeadWhereInput,
  query: StatsQuery,
  includeCompanies: boolean,
): Promise<ApiLeadStats> {
  const days = clamp(query.days, 14, MAX_DAYS);
  const months = clamp(query.months, 6, MAX_MONTHS);
  const deltaDays = clamp(query.deltaDays, 7, MAX_DAYS);

  const dayMs = 86_400_000;
  const now = Date.now();
  const windowStart = new Date(now - deltaDays * dayMs);
  const priorStart = new Date(now - 2 * deltaDays * dayMs);

  const [total, statuses, perDay, perMonth, current, previous, companies, catalog] =
    await Promise.all([
      prisma.lead.count({ where }),
      statusCounts(where),
      bucketSeries(where, "day", days),
      bucketSeries(where, "month", months),
      prisma.lead.count({ where: { ...where, createdAt: { gte: windowStart } } }),
      prisma.lead.count({
        where: { ...where, createdAt: { gte: priorStart, lt: windowStart } },
      }),
      includeCompanies ? byCompany(MAX_COMPANIES) : Promise.resolve([]),
      includeCompanies ? catalogCounts() : Promise.resolve(null),
    ]);

  return {
    total,
    byStatus: statuses,
    perDay,
    perMonth,
    byCompany: companies,
    recent: { days: deltaDays, current, previous },
    ...(catalog ? { catalog } : {}),
    timezone: TZ,
  };
}

/**
 * Catalog totals for the admin KPI row.
 *
 * Here rather than counted from the cached company list for the same reason as
 * the lead totals: the admin catalog is hydrated with `pageSize=200`, which the
 * service clamps to 100, so `companies.length` in the browser is a page size once
 * the platform passes a hundred companies — not a count.
 */
async function catalogCounts(): Promise<NonNullable<ApiLeadStats["catalog"]>> {
  const [companies, activeCompanies, categories] = await Promise.all([
    prisma.company.count(),
    prisma.company.count({ where: { status: "ACTIVE" } }),
    prisma.category.count(),
  ]);
  return { companies, activeCompanies, categories };
}

/** Admin: aggregates across every company. */
export function forAllCompanies(query: StatsQuery): Promise<ApiLeadStats> {
  return build({}, query, true);
}

/** Provider: aggregates scoped to their own company. */
export function forCompany(companyId: string, query: StatsQuery): Promise<ApiLeadStats> {
  return build({ companyId }, query, false);
}
