import { ok } from "@/lib/utils/response";
import { adminOnly } from "@/lib/middleware/guards";
import * as service from "@/lib/services/feedback.service";

export const dynamic = "force-dynamic";

// GET /api/admin/feedback → all ApiFeedback[] (newest first, for triage).
export const GET = adminOnly(async () => {
  return ok(await service.listAll());
});
