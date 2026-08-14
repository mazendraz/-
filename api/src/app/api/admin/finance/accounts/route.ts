import type { NextRequest } from "next/server";
import { ok } from "@/lib/utils/response";
import { desktopOnly } from "@/lib/middleware/guards";
import { financialAccountSchema } from "@/lib/validation/finance";
import * as finance from "@/lib/services/finance.service";
import * as audit from "@/lib/services/audit.service";

export const dynamic = "force-dynamic";

// GET /api/admin/finance/accounts → ApiFinancialAccount[]. Small, unpaginated
// list (a handful of cash boxes/bank accounts) — feeds the account picker on
// the transaction form and the Cash Position breakdown.
export const GET = desktopOnly("finance:read", async () => {
  return ok(await finance.listAccounts());
});

// POST /api/admin/finance/accounts → create a new cash box / bank account.
export const POST = desktopOnly("finance:write", async (request: NextRequest, _ctx, user) => {
  const input = financialAccountSchema.parse(await request.json());
  const result = await finance.createAccount(input);
  await audit.record(user, { action: "finance.account.create", entity: "FinancialAccount", entityId: result.id });
  return ok(result, 201);
});
