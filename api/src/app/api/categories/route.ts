import { withErrors } from "@/lib/utils/withErrors";
import { ok } from "@/lib/utils/response";
import * as categoriesService from "@/lib/services/categories.service";

export const dynamic = "force-dynamic";

// GET /api/categories → ApiCategory[] (active categories, live ACTIVE-company count)
export const GET = withErrors(async () => {
  const categories = await categoriesService.listActive();
  return ok(categories);
});
