import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { ok } from "@/lib/utils/response";
import { adminOnly } from "@/lib/middleware/guards";
import { projectStatusSchema } from "@/lib/validation/projects";
import * as projectsService from "@/lib/services/projects.service";
import * as audit from "@/lib/services/audit.service";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// PATCH /api/admin/projects/[id] → set moderation status (approve / reject).
export const PATCH = adminOnly(async (request: NextRequest, ctx: Ctx, user) => {
  const { id } = await ctx.params;
  const { status } = projectStatusSchema.parse(await request.json());
  const project = await projectsService.setStatus(id, status);
  await audit.record(user, { action: `project.${status.toLowerCase()}`, entity: "Project", entityId: id });
  return ok(project);
});

// DELETE /api/admin/projects/[id] → remove any project (admin override).
export const DELETE = adminOnly(async (_request: NextRequest, ctx: Ctx, user) => {
  const { id } = await ctx.params;
  await projectsService.removeById(id);
  await audit.record(user, { action: "project.delete", entity: "Project", entityId: id });
  return new NextResponse(null, { status: 204 });
});
