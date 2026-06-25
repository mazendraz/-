import { NextResponse, type NextRequest } from "next/server";
import { adminOnly } from "@/lib/middleware/guards";
import * as leadsService from "@/lib/services/leads.service";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// DELETE /api/admin/leads/[id] → 204 (admin only)
export const DELETE = adminOnly(async (_request: NextRequest, ctx: Ctx) => {
  const { id } = await ctx.params;
  await leadsService.remove(id);
  return new NextResponse(null, { status: 204 });
});
