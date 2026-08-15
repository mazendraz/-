import type { NextRequest } from "next/server";
import { ok } from "@/lib/utils/response";
import { desktopOnly } from "@/lib/middleware/guards";
import { parseFinanceQuery } from "@/lib/utils/query";
import * as finance from "@/lib/services/finance.service";

export const dynamic = "force-dynamic";

// GET /api/admin/finance/overview → ApiFinanceOverview. The Finance Overview
// screen's KPI row (Total Service Value, Al Asima Revenue, Expenses, Net
// Income, Outstanding, Cash Position, Commission Pipeline). Also read by the
// Analytics module's Business Performance screen (it already surfaces these
// same finance KPIs by design), so "analytics:read" is an equally valid
// grant here (see withPermission.ts's ANY-of comment) — this does not
// broaden Finance module access, finance:read is unchanged.
export const GET = desktopOnly(["finance:read", "analytics:read"], async (request: NextRequest) => {
  const query = parseFinanceQuery(request.nextUrl.searchParams);
  return ok(await finance.financeOverview(query), 200, { "Cache-Control": "no-store" });
});
