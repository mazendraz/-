import type { NextRequest } from "next/server";
import { ok, page } from "@/lib/utils/response";
import { desktopOnly } from "@/lib/middleware/guards";
import { parseTransactionListQuery } from "@/lib/utils/query";
import { createTransactionSchema } from "@/lib/validation/finance";
import * as finance from "@/lib/services/finance.service";
import * as audit from "@/lib/services/audit.service";

export const dynamic = "force-dynamic";

// GET /api/admin/finance/transactions → ApiPage<ApiTransaction>. Filterable by
// type/status/category/company/date range — backs the Transactions table and
// (filtered to status=DISPUTED) the unresolved-disputes queue.
export const GET = desktopOnly("finance:read", async (request: NextRequest) => {
  const query = parseTransactionListQuery(request.nextUrl.searchParams);
  const result = await finance.listTransactions(query);
  return page(result.data, result.meta);
});

// POST /api/admin/finance/transactions → manual EXPENSE or ADJUSTMENT entry.
// COMMISSION_INCOME can NEVER be created here — see the schema's validation
// (type is restricted to EXPENSE|ADJUSTMENT) and ApiTransactionCreatePayload's
// doc comment for why.
export const POST = desktopOnly("finance:write", async (request: NextRequest, _ctx, user) => {
  const input = createTransactionSchema.parse(await request.json());
  const result = await finance.createTransaction(input, user.id);
  await audit.record(user, {
    action: "finance.transaction.create",
    entity: "Transaction",
    entityId: result.id,
    meta: { type: input.type, amount: input.amount },
  });
  return ok(result, 201);
});
