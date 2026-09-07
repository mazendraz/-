// Funnel analytics: the write side (one row per step a visitor takes) and the
// read side (the aggregate the admin dashboard shows). See the SiteEvent model
// in schema.prisma for why this table is anonymous and first-party.
import { prisma } from "@/lib/prisma";
import { FUNNEL_STAGES, type FunnelStage, type TrackEventInput } from "@/lib/validation/siteEvents";

/**
 * Record one funnel event.
 *
 * Best-effort by design: analytics must never be able to break the page that
 * reports it. A failed insert here costs one row of a chart; throwing would
 * cost the visitor their request. So this swallows everything and the route
 * answers 202 regardless.
 */
export async function recordEvent(input: TrackEventInput): Promise<void> {
  try {
    // Raw INSERT rather than prisma.siteEvent.create() on purpose: it works the
    // moment the migration is applied, with no dependency on `prisma generate`
    // having been re-run wherever this is built. Parameterised through the
    // tagged template (never string-concatenated), so the values are bound, not
    // interpolated. Swap it for the typed create() any time after the generated
    // client here knows about SiteEvent.
    await prisma.$executeRaw`
      INSERT INTO "SiteEvent" ("id", "sessionId", "name", "path", "source", "target", "createdAt")
      VALUES (gen_random_uuid()::text, ${input.sessionId}, ${input.name}, ${input.path},
              ${input.source ?? null}, ${input.target ?? null}, NOW())
    `;
  } catch (err) {
    console.error("[analytics] recordEvent failed:", err);
  }
}

export interface FunnelStageRow {
  stage: FunnelStage;
  /** Distinct visits that reached this stage — people, not page loads. */
  sessions: number;
  /** Raw event count, so "opened the form 4 times" stays visible. */
  events: number;
  /** Share of the stage above it: the number to read when hunting the leak. */
  conversionFromPrevious: number;
  /** Share of all visits that got this far. */
  conversionFromTop: number;
}

export interface FunnelReport {
  from: string;
  to: string;
  stages: FunnelStageRow[];
  /** Top referrer hosts in the window, biggest first. */
  sources: { source: string; sessions: number }[];
  /** Pages where the MOST visits ended — the literal answer to "بيقفوا فين". */
  exitPaths: { path: string; sessions: number }[];
}

/**
 * The funnel for a window, counted in DISTINCT SESSIONS at every stage.
 *
 * Sessions, not events, because the question is "how many people dropped",
 * and one hesitant visitor who opens the form three times is one person — an
 * event count would quietly report them as three and make the form look
 * healthier than it is.
 */
export async function funnel(from: Date, to: Date): Promise<FunnelReport> {
  const rows = await prisma.$queryRaw<{ name: string; sessions: bigint; events: bigint }[]>`
    SELECT "name", COUNT(DISTINCT "sessionId") AS sessions, COUNT(*) AS events
    FROM "SiteEvent"
    WHERE "createdAt" >= ${from} AND "createdAt" < ${to}
    GROUP BY "name"
  `;
  const byName = new Map(rows.map((r) => [r.name, r]));

  const top = Number(byName.get("page_view")?.sessions ?? 0);
  let previous = 0;
  const stages: FunnelStageRow[] = FUNNEL_STAGES.map((stage) => {
    const sessions = Number(byName.get(stage)?.sessions ?? 0);
    const events = Number(byName.get(stage)?.events ?? 0);
    // Compare against the last stage that actually had traffic: a stage nobody
    // reached would otherwise divide by zero and report every later stage as 0%.
    const conversionFromPrevious = previous > 0 ? sessions / previous : stage === "page_view" ? 1 : 0;
    if (sessions > 0) previous = sessions;
    return {
      stage,
      sessions,
      events,
      conversionFromPrevious,
      conversionFromTop: top > 0 ? sessions / top : 0,
    };
  });

  const sources = await prisma.$queryRaw<{ source: string; sessions: bigint }[]>`
    SELECT COALESCE("source", 'direct') AS source, COUNT(DISTINCT "sessionId") AS sessions
    FROM "SiteEvent"
    WHERE "createdAt" >= ${from} AND "createdAt" < ${to}
    GROUP BY 1
    ORDER BY sessions DESC
    LIMIT 15
  `;

  // The LAST page each visit was seen on. That page is where the visit ended,
  // which is the page to go look at when the funnel says people are leaving.
  const exitPaths = await prisma.$queryRaw<{ path: string; sessions: bigint }[]>`
    SELECT "path", COUNT(*) AS sessions
    FROM (
      SELECT DISTINCT ON ("sessionId") "sessionId", "path"
      FROM "SiteEvent"
      WHERE "createdAt" >= ${from} AND "createdAt" < ${to}
      ORDER BY "sessionId", "createdAt" DESC
    ) AS last_seen
    GROUP BY "path"
    ORDER BY sessions DESC
    LIMIT 15
  `;

  return {
    from: from.toISOString(),
    to: to.toISOString(),
    stages,
    sources: sources.map((s) => ({ source: s.source, sessions: Number(s.sessions) })),
    exitPaths: exitPaths.map((p) => ({ path: p.path, sessions: Number(p.sessions) })),
  };
}
