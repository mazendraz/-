import { NextResponse, type NextRequest } from "next/server";
import { adminOnly } from "@/lib/middleware/guards";
import * as projectsService from "@/lib/services/projects.service";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; projectId: string }> };

// DELETE /api/admin/companies/[id]/projects/[projectId] → 204
export const DELETE = adminOnly(async (_request: NextRequest, ctx: Ctx) => {
  const { id, projectId } = await ctx.params;
  await projectsService.remove(id, projectId);
  return new NextResponse(null, { status: 204 });
});
