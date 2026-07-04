import { NextResponse, type NextRequest } from "next/server";
import { adminOnly } from "@/lib/middleware/guards";
import * as leadsService from "@/lib/services/leads.service";
import * as audit from "@/lib/services/audit.service";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// DELETE /api/admin/leads/[id] → 204 (admin only)
export const DELETE = adminOnly(async (_request: NextRequest, ctx: Ctx, user) => {
  const { id } = await ctx.params;
  await leadsService.remove(id);
  await audit.record(user, { action: "lead.delete", entity: "Lead", entityId: id });
  return new NextResponse(null, { status: 204 });
});
