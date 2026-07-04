import type { NextRequest } from "next/server";
import { ok } from "@/lib/utils/response";
import { adminOnly } from "@/lib/middleware/guards";
import * as auditService from "@/lib/services/audit.service";

export const dynamic = "force-dynamic";

// GET /api/admin/audit-logs → ApiPage<ApiAuditLog> (newest first; filter by entity/action)
export const GET = adminOnly(async (request: NextRequest) => {
  const sp = request.nextUrl.searchParams;
  const num = (v: string | null) => (v != null && v !== "" ? Number(v) : undefined);
  return ok(
    await auditService.list({
      page: num(sp.get("page")),
      pageSize: num(sp.get("pageSize")),
      entity: sp.get("entity") ?? undefined,
      action: sp.get("action") ?? undefined,
    }),
  );
});
