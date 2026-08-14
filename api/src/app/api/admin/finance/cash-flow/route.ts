import type { NextRequest } from "next/server";
import { ok } from "@/lib/utils/response";
import { desktopOnly } from "@/lib/middleware/guards";
import { parseCashFlowQuery } from "@/lib/utils/query";
import * as finance from "@/lib/services/finance.service";

export const dynamic = "force-dynamic";

// GET /api/admin/finance/cash-flow → ApiCashFlow. Money In / Money Out / Net
// Cash Flow (all windowed to `days`) + a running Cash Balance + the trend
// series that backs the chart.
export const GET = desktopOnly("finance:read", async (request: NextRequest) => {
  const query = parseCashFlowQuery(request.nextUrl.searchParams);
  return ok(await finance.financeCashFlow(query), 200, { "Cache-Control": "no-store" });
});
