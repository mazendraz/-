import type { NextRequest } from "next/server";
import { ok } from "@/lib/utils/response";
import { adminOnly } from "@/lib/middleware/guards";
import { upsertCategorySchema } from "@/lib/validation/categories";
import * as categoriesService from "@/lib/services/categories.service";

export const dynamic = "force-dynamic";

// GET /api/admin/categories → all categories (with total company counts)
export const GET = adminOnly(async () => {
  return ok(await categoriesService.listAll());
});

// POST /api/admin/categories → create (auto-slug from label)
export const POST = adminOnly(async (request: NextRequest) => {
  const input = upsertCategorySchema.parse(await request.json());
  const category = await categoriesService.create(input);
  return ok(category, 201);
});
