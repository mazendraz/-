import type { NextRequest } from "next/server";
import { page } from "@/lib/utils/response";
import { desktopOnly } from "@/lib/middleware/guards";
import { parseClientListQuery } from "@/lib/utils/query";
import * as clientsService from "@/lib/services/clients.service";

export const dynamic = "force-dynamic";

// GET /api/admin/clients → ApiPage<ApiClient>. The Clients & CRM roster —
// backed by the new Client model (phone-deduplicated, NOT a customer login;
// see schema.prisma's Client comment).
export const GET = desktopOnly("business:read", async (request: NextRequest) => {
  const query = parseClientListQuery(request.nextUrl.searchParams);
  const result = await clientsService.list(query);
  return page(result.data, result.meta);
});
