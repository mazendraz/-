import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { ok } from "@/lib/utils/response";
import { providerOnly } from "@/lib/middleware/guards";
import { updateProjectSchema } from "@/lib/validation/projects";
import { ValidationError } from "@/lib/utils/errors";
import * as projectsService from "@/lib/services/projects.service";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// PUT /api/provider/projects/[id] → edit own project (sends it back to PENDING).
export const PUT = providerOnly(async (request: NextRequest, ctx: Ctx, user) => {
  if (!user.companyId) throw new ValidationError("Your account isn't linked to a company yet.");
  const { id } = await ctx.params;
  const input = updateProjectSchema.parse(await request.json());
  return ok(await projectsService.updateForCompany(user.companyId, id, input));
});

// DELETE /api/provider/projects/[id] → remove own project.
export const DELETE = providerOnly(async (_request: NextRequest, ctx: Ctx, user) => {
  if (!user.companyId) throw new ValidationError("Your account isn't linked to a company yet.");
  const { id } = await ctx.params;
  await projectsService.remove(user.companyId, id);
  return new NextResponse(null, { status: 204 });
});
