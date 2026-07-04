import type { NextRequest } from "next/server";
import { ok } from "@/lib/utils/response";
import { providerOnly } from "@/lib/middleware/guards";
import { createProjectSchema } from "@/lib/validation/projects";
import { ValidationError } from "@/lib/utils/errors";
import * as projectsService from "@/lib/services/projects.service";

export const dynamic = "force-dynamic";

// GET /api/provider/projects → all of the provider's own projects (any status).
export const GET = providerOnly(async (_request: NextRequest, _ctx, user) => {
  if (!user.companyId) return ok([]);
  return ok(await projectsService.listByCompany(user.companyId));
});

// POST /api/provider/projects → submit a new project (created PENDING for review).
export const POST = providerOnly(async (request: NextRequest, _ctx, user) => {
  if (!user.companyId) throw new ValidationError("Your account isn't linked to a company yet.");
  const input = createProjectSchema.parse(await request.json());
  return ok(await projectsService.createForCompany(user.companyId, input), 201);
});
