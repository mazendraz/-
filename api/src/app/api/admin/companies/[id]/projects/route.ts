import type { NextRequest } from "next/server";
import { ok } from "@/lib/utils/response";
import { adminOnly } from "@/lib/middleware/guards";
import { createProjectSchema } from "@/lib/validation/projects";
import * as projectsService from "@/lib/services/projects.service";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/admin/companies/[id]/projects → add a project
export const POST = adminOnly(async (request: NextRequest, ctx: Ctx) => {
  const { id } = await ctx.params;
  const input = createProjectSchema.parse(await request.json());
  return ok(await projectsService.add(id, input), 201);
});
