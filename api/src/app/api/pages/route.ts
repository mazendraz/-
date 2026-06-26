import { withErrors } from "@/lib/utils/withErrors";
import { ok } from "@/lib/utils/response";
import * as settingsService from "@/lib/services/settings.service";

export const dynamic = "force-dynamic";

// GET /api/pages → ApiLegalPages (public; Terms + Privacy content).
export const GET = withErrors(async () => {
  return ok(await settingsService.getLegalPages());
});
