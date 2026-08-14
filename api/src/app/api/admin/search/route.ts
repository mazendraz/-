import type { NextRequest } from "next/server";
import { ok } from "@/lib/utils/response";
import { adminOnly } from "@/lib/middleware/guards";
import { hasDesktopPermission } from "@/lib/middleware/withPermission";
import { globalSearch } from "@/lib/services/globalSearch.service";
import type { ApiSearchCategory, ApiSearchResponse } from "@/lib/apiTypes";

export const dynamic = "force-dynamic";

// One category per desktop module — a user only ever searches the modules
// they can already see. Not gated behind a single desktopOnly(permission)
// call (unlike every other desktop route) because search is cross-module by
// nature; adminOnly() below still requires the ADMIN role, and each category
// is independently gated by the SAME permission its own list screen requires.
const CATEGORY_PERMISSION: Record<ApiSearchCategory, Parameters<typeof hasDesktopPermission>[1]> = {
  client: "business:read",
  provider: "business:read",
  request: "operations:read",
  service: "business:read",
  transaction: "finance:read",
};

// GET /api/admin/search?q= → ApiSearchResponse.
export const GET = adminOnly(async (request: NextRequest, _ctx, user) => {
  const q = (request.nextUrl.searchParams.get("q") ?? "").trim();
  const categories = (Object.keys(CATEGORY_PERMISSION) as ApiSearchCategory[]).filter((c) =>
    hasDesktopPermission(user, CATEGORY_PERMISSION[c]),
  );
  const results = await globalSearch(q, categories);
  const body: ApiSearchResponse = { query: q, results };
  return ok(body, 200, { "Cache-Control": "no-store" });
});
