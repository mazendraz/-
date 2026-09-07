import type { NextRequest } from "next/server";
import { ok } from "@/lib/utils/response";
import { adminOnly } from "@/lib/middleware/guards";
import * as siteEvents from "@/lib/services/siteEvents.service";

export const dynamic = "force-dynamic";

const DAY_MS = 86_400_000;
// Long enough to see a monthly pattern, short enough that the aggregate stays
// cheap on an unpartitioned table.
const MAX_DAYS = 180;
const DEFAULT_DAYS = 30;

// GET /api/admin/analytics/funnel?days=30 → FunnelReport.
//
// One endpoint for the whole picture (stages + sources + exit pages) because
// the three are only meaningful read together: a stage's drop is a number, the
// exit pages are where to go look at why.
export const GET = adminOnly(async (request: NextRequest) => {
  const raw = Number(request.nextUrl.searchParams.get("days") ?? DEFAULT_DAYS);
  const days = Math.min(MAX_DAYS, Math.max(1, Math.trunc(raw) || DEFAULT_DAYS));
  const to = new Date();
  const from = new Date(to.getTime() - days * DAY_MS);
  return ok(await siteEvents.funnel(from, to), 200, { "Cache-Control": "no-store" });
});
