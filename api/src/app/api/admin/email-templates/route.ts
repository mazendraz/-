import type { NextRequest } from "next/server";
import { ok } from "@/lib/utils/response";
import { adminOnly } from "@/lib/middleware/guards";
import { updateEmailTemplatesSchema } from "@/lib/validation/settings";
import * as settingsService from "@/lib/services/settings.service";
import * as audit from "@/lib/services/audit.service";

export const dynamic = "force-dynamic";

// GET /api/admin/email-templates → ApiEmailTemplates (blank field = built-in default).
export const GET = adminOnly(async () => {
  return ok(await settingsService.getEmailTemplates());
});

// PUT /api/admin/email-templates → partial update; returns the full set.
export const PUT = adminOnly(async (request: NextRequest, _ctx, user) => {
  const patch = updateEmailTemplatesSchema.parse(await request.json());
  const result = await settingsService.updateEmailTemplates(patch);
  await audit.record(user, {
    action: "email_templates.update",
    entity: "EmailTemplates",
    entityId: "platform",
    meta: { keys: Object.keys(patch) },
  });
  return ok(result);
});
