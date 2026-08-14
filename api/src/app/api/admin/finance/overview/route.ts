import type { NextRequest } from "next/server";
import { ok } from "@/lib/utils/response";
import { desktopOnly } from "@/lib/middleware/guards";
import { parseFinanceQuery } from "@/lib/utils/query";
import * as finance from "@/lib/services/finance.service";

export const dynamic = "force-dynamic";

// GET /api/admin/finance/overview → ApiFinanceOverview. The Finance Overview
// screen's KPI row (Total Service Value, Al Asima Revenue, Expenses, Net
// Income, Outstanding, Cash Position, Commission Pipeline).
export const GET = desktopOnly("finance:read", async (request: NextRequest) => {
  const query = parseFinanceQuery(request.nextUrl.searchParams);
  return ok(await finance.financeOverview(query), 200, { "Cache-Control": "no-store" });
});
