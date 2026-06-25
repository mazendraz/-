import type { NextRequest } from "next/server";
import { ok } from "@/lib/utils/response";
import { adminOnly } from "@/lib/middleware/guards";
import { parseCompanyListQuery } from "@/lib/utils/query";
import { upsertCompanySchema } from "@/lib/validation/companies";
import * as companiesService from "@/lib/services/companies.service";
import type { CompanyStatusValue } from "@/lib/services/companies.service";

export const dynamic = "force-dynamic";

const STATUSES: readonly CompanyStatusValue[] = ["ACTIVE", "INACTIVE", "SUSPENDED"];

// GET /api/admin/companies → all statuses, filterable by category/status/search
export const GET = adminOnly(async (request: NextRequest) => {
  const base = parseCompanyListQuery(request.nextUrl.searchParams);
  const statusParam = request.nextUrl.searchParams.get("status");
  const status = STATUSES.includes(statusParam as CompanyStatusValue)
    ? (statusParam as CompanyStatusValue)
    : undefined;
  return ok(await companiesService.listAll({ ...base, status }));
});

// POST /api/admin/companies → create (auto-slug from name)
export const POST = adminOnly(async (request: NextRequest) => {
  const input = upsertCompanySchema.parse(await request.json());
  const company = await companiesService.create(input);
  return ok(company, 201);
});
