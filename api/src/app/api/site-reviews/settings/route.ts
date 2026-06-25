import { withErrors } from "@/lib/utils/withErrors";
import { ok } from "@/lib/utils/response";
import * as service from "@/lib/services/siteReviews.service";

export const dynamic = "force-dynamic";

// GET /api/site-reviews/settings → { enabled } (public; the submit form checks this).
export const GET = withErrors(async () => {
  return ok({ enabled: await service.getEnabled() });
});
