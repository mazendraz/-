import type { NextRequest } from "next/server";
import { ok } from "@/lib/utils/response";
import { desktopOnly } from "@/lib/middleware/guards";
import { transactionStatusPatchSchema } from "@/lib/validation/finance";
import * as finance from "@/lib/services/finance.service";
import * as audit from "@/lib/services/audit.service";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// PATCH /api/admin/finance/transactions/[id] → status transition only. Used
// to: mark an expense COLLECTED once paid, mark a DISPUTED commission
// resolved (-> PENDING/COLLECTED once an admin settles the discrepancy
// operationally), or VOID a mistake. Every transition is audited — this is
// money, not content.
export const PATCH = desktopOnly("finance:write", async (request: NextRequest, ctx: Ctx, user) => {
  const { id } = await ctx.params;
  const input = transactionStatusPatchSchema.parse(await request.json());
  const result = await finance.updateTransactionStatus(id, input);
  await audit.record(user, {
    action: "finance.transaction.status",
    entity: "Transaction",
    entityId: id,
    meta: { status: input.status },
  });
  return ok(result);
});
