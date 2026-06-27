import type { NextRequest } from "next/server";
import { ok } from "@/lib/utils/response";
import { adminOnly } from "@/lib/middleware/guards";
import { ProjectStatus } from "@/generated/prisma/enums";
import * as projectsService from "@/lib/services/projects.service";

export const dynamic = "force-dynamic";

const STATUSES = new Set<string>(["PENDING", "APPROVED", "REJECTED"]);

// GET /api/admin/projects?status=PENDING → moderation queue (defaults to PENDING).
export const GET = adminOnly(async (request: NextRequest) => {
  const raw = request.nextUrl.searchParams.get("status");
  const status = (raw && STATUSES.has(raw) ? raw : "PENDING") as ProjectStatus;
  return ok(await projectsService.listForModeration(status));
});
