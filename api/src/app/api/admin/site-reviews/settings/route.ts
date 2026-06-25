import type { NextRequest } from "next/server";
import { ok } from "@/lib/utils/response";
import { adminOnly } from "@/lib/middleware/guards";
import { siteReviewSettingsSchema } from "@/lib/validation/siteReviews";
import * as service from "@/lib/services/siteReviews.service";

export const dynamic = "force-dynamic";

// PUT /api/admin/site-reviews/settings → { enabled } (open/close submissions)
export const PUT = adminOnly(async (request: NextRequest) => {
  const { enabled } = siteReviewSettingsSchema.parse(await request.json());
  return ok({ enabled: await service.setEnabled(enabled) });
});
