import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/utils/response";
import { desktopOnly } from "@/lib/middleware/guards";
import { parseReportQuery } from "@/lib/utils/query";
import { generateReport } from "@/lib/services/reports.service";

export const dynamic = "force-dynamic";

// GET /api/admin/reports?type=&from=&to= → ApiReport. Backs the Reports
// Center's Generate/Preview (columns+rows) and Export (the same response's
// `csv` field) — one fetch, one source of truth, so a preview can never show
// something different from what gets exported.
export const GET = desktopOnly("reports:read", async (request: NextRequest) => {
  const query = parseReportQuery(request.nextUrl.searchParams);
  if (!query) {
    return fail("VALIDATION_ERROR", "type must be one of the known report types.", 400);
  }
  return ok(await generateReport(query), 200, { "Cache-Control": "no-store" });
});
