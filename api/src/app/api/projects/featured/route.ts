import { withErrors } from "@/lib/utils/withErrors";
import { okCached } from "@/lib/utils/response";
import * as projectsService from "@/lib/services/projects.service";

export const dynamic = "force-dynamic";

// GET /api/projects/featured → ApiFeaturedProject[] (homepage showcase; public).
export const GET = withErrors(async () => {
  return okCached(await projectsService.listFeatured());
});
