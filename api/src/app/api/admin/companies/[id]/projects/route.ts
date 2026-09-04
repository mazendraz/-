import type { NextRequest } from "next/server";
import { ok } from "@/lib/utils/response";
import { adminOnly } from "@/lib/middleware/guards";
import { createProjectSchema } from "@/lib/validation/projects";
import * as projectsService from "@/lib/services/projects.service";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/admin/companies/[id]/projects → ApiProject[] WITH ids.
//
// The admin gallery screen used to read `company.projects` off the company
// detail payload, which serializes projects with the PUBLIC serializer — and
// that one deliberately omits `id` (see serializeProject). So every row had
// `key={undefined}` (a React "unique key" warning) and, worse, its delete
// button posted an undefined id. This route returns serializeProjectAdmin,
// which carries `id` and `status`, exactly like the provider's own
// /provider/projects listing.
export const GET = adminOnly(async (_request: NextRequest, ctx: Ctx) => {
  const { id } = await ctx.params;
  return ok(await projectsService.listByCompany(id));
});

// POST /api/admin/companies/[id]/projects → add a project
export const POST = adminOnly(async (request: NextRequest, ctx: Ctx) => {
  const { id } = await ctx.params;
  const input = createProjectSchema.parse(await request.json());
  return ok(await projectsService.add(id, input), 201);
});
