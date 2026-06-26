import type { NextRequest } from "next/server";
import { ok } from "@/lib/utils/response";
import { adminOnly } from "@/lib/middleware/guards";
import { parseAdminUserListQuery } from "@/lib/utils/query";
import { createUserSchema } from "@/lib/validation/users";
import * as usersService from "@/lib/services/users.service";
import * as audit from "@/lib/services/audit.service";

export const dynamic = "force-dynamic";

// GET /api/admin/users → ApiPage<ApiAdminUser> (filter by role / search)
export const GET = adminOnly(async (request: NextRequest) => {
  const query = parseAdminUserListQuery(request.nextUrl.searchParams);
  return ok(await usersService.list(query));
});

// POST /api/admin/users → create an account (defaults to PROVIDER). 409 on dup email.
export const POST = adminOnly(async (request: NextRequest, _ctx, user) => {
  const input = createUserSchema.parse(await request.json());
  const created = await usersService.create(input);
  await audit.record(user, {
    action: "user.create",
    entity: "User",
    entityId: created.id,
    meta: { role: created.role, email: created.email },
  });
  return ok(created, 201);
});
