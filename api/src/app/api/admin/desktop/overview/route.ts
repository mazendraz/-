import type { NextRequest } from "next/server";
import { ok } from "@/lib/utils/response";
import { desktopOnly } from "@/lib/middleware/guards";
import { parseDesktopOverviewQuery } from "@/lib/utils/query";
import { desktopOverview } from "@/lib/services/desktopOverview.service";

export const dynamic = "force-dynamic";

// GET /api/admin/desktop/overview → ApiDesktopOverview. The desktop app's
// Overview screen: KPI row + "Needs Your Attention" cards, composed from the
// existing lead/finance aggregates (no new source of truth).
export const GET = desktopOnly("overview:read", async (request: NextRequest) => {
  const query = parseDesktopOverviewQuery(request.nextUrl.searchParams);
  return ok(await desktopOverview(query), 200, { "Cache-Control": "no-store" });
});
