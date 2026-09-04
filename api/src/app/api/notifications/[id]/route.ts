import type { NextRequest } from "next/server";
import { ok } from "@/lib/utils/response";
import { authed } from "@/lib/middleware/guards";
import * as notifications from "@/lib/services/notifications.staff.service";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// PATCH /api/v1/notifications/[id] → mark one notification read. No body: read
// is the only transition, and there is no un-read.
//
// Ownership is enforced inside the service, in the WHERE clause rather than as a
// check after the fetch — another staff member's id matches zero rows and 404s
// exactly like a nonexistent one, so this route leaks nothing about whether a
// given id exists on someone else's account.
export const PATCH = authed(async (_request: NextRequest, context: Ctx, user) => {
  const { id } = await context.params;
  await notifications.markRead(user.id, id);
  return ok({ read: true });
});
