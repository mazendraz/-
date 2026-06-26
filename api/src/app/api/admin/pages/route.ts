import type { NextRequest } from "next/server";
import { ok } from "@/lib/utils/response";
import { adminOnly } from "@/lib/middleware/guards";
import { updateLegalPagesSchema } from "@/lib/validation/settings";
import * as settingsService from "@/lib/services/settings.service";
import * as audit from "@/lib/services/audit.service";

export const dynamic = "force-dynamic";

// GET /api/admin/pages → ApiLegalPages (for editing).
export const GET = adminOnly(async () => {
  return ok(await settingsService.getLegalPages());
});

// PUT /api/admin/pages → partial update (terms / privacy); returns the full set.
export const PUT = adminOnly(async (request: NextRequest, _ctx, user) => {
  const patch = updateLegalPagesSchema.parse(await request.json());
  const result = await settingsService.updateLegalPages(patch);
  await audit.record(user, {
    action: "legal_pages.update",
    entity: "LegalPages",
    entityId: "platform",
    meta: { keys: Object.keys(patch) },
  });
  return ok(result);
});
