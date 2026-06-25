import { ok } from "@/lib/utils/response";
import { adminOnly } from "@/lib/middleware/guards";
import * as service from "@/lib/services/siteReviews.service";

export const dynamic = "force-dynamic";

// GET /api/admin/site-reviews → all ApiSiteReview[] (visible + hidden, for moderation).
export const GET = adminOnly(async () => {
  return ok(await service.listAll());
});
