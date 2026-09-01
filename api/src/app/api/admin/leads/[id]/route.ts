import { NextResponse, type NextRequest } from "next/server";
import { ok } from "@/lib/utils/response";
import { adminOnly } from "@/lib/middleware/guards";
import { NotFoundError } from "@/lib/utils/errors";
import * as leadsService from "@/lib/services/leads.service";
import * as audit from "@/lib/services/audit.service";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/admin/leads/[id] → 200 + ApiLead. Any company's lead, by id — the
// admin counterpart of provider/leads/[id]'s same fix: an admin lead-detail
// screen previously had no way to open a lead that wasn't already sitting in
// an already-fetched page of GET /admin/leads.
export const GET = adminOnly(async (_request: NextRequest, ctx: Ctx) => {
  const { id } = await ctx.params;
  const lead = await leadsService.getById(id);
  if (!lead) throw new NotFoundError("Lead");
  return ok(lead);
});

// DELETE /api/admin/leads/[id] → 204 (admin only)
export const DELETE = adminOnly(async (_request: NextRequest, ctx: Ctx, user) => {
  const { id } = await ctx.params;
  await leadsService.remove(id);
  await audit.record(user, { action: "lead.delete", entity: "Lead", entityId: id });
  return new NextResponse(null, { status: 204 });
});
