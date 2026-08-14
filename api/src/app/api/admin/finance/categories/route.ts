import type { NextRequest } from "next/server";
import { ok } from "@/lib/utils/response";
import { desktopOnly } from "@/lib/middleware/guards";
import { transactionCategorySchema } from "@/lib/validation/finance";
import * as finance from "@/lib/services/finance.service";
import * as audit from "@/lib/services/audit.service";

export const dynamic = "force-dynamic";

// GET /api/admin/finance/categories → ApiTransactionCategory[]. Feeds the
// category picker on the transaction form and the "Expenses by Category" card.
export const GET = desktopOnly("finance:read", async () => {
  return ok(await finance.listCategories());
});

// POST /api/admin/finance/categories → create a new category (e.g. "Marketing").
export const POST = desktopOnly("finance:write", async (request: NextRequest, _ctx, user) => {
  const input = transactionCategorySchema.parse(await request.json());
  const result = await finance.createCategory(input);
  await audit.record(user, { action: "finance.category.create", entity: "TransactionCategory", entityId: result.id });
  return ok(result, 201);
});
