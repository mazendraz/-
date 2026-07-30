import type { NextRequest } from "next/server";
import { page } from "@/lib/utils/response";
import { adminOnly } from "@/lib/middleware/guards";
import * as chat from "@/lib/services/chat.service";

export const dynamic = "force-dynamic";

// GET /api/admin/chat?companyId=&q=&page=&unread=1 → every conversation.
// `q` matches a reference number, a customer name or a company name — the three
// things an admin actually has to hand when someone reports a problem.
// `unread=1` narrows to threads a customer is still waiting on; the sidebar badge
// reads `meta.total` from it with pageSize=1, so it costs a COUNT and one row.
export const GET = adminOnly(async (request: NextRequest) => {
  const url = new URL(request.url);
  const size = Number(url.searchParams.get("pageSize")) || undefined;
  const result = await chat.listAll({
    companyId: url.searchParams.get("companyId") ?? undefined,
    q: url.searchParams.get("q") ?? undefined,
    page: Number(url.searchParams.get("page")) || undefined,
    pageSize: size,
    unreadOnly: url.searchParams.get("unread") === "1",
  });
  return page(result.data, result.meta);
});
