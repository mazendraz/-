import { withErrors } from "@/lib/utils/withErrors";
import { ok } from "@/lib/utils/response";
import * as projectsService from "@/lib/services/projects.service";

export const dynamic = "force-dynamic";

// GET /api/projects/featured → ApiFeaturedProject[] (homepage showcase; public).
export const GET = withErrors(async () => {
  return ok(await projectsService.listFeatured());
});
