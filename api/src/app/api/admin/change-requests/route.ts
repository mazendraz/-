import type { NextRequest } from "next/server";
import { ok, page } from "@/lib/utils/response";
import { adminOnly } from "@/lib/middleware/guards";
import { changeRequestListQuerySchema } from "@/lib/validation/changeRequests";
import * as changeRequests from "@/lib/services/changeRequests.service";

export const dynamic = "force-dynamic";

// GET /api/admin/change-requests?entity=&status=&companyId=&page= → ApiPage.
export const GET = adminOnly(async (request: NextRequest) => {
  const url = new URL(request.url);
  const query = changeRequestListQuerySchema.parse(Object.fromEntries(url.searchParams));
  const result = await changeRequests.list(query);
  return page(result.data, result.meta);
});
