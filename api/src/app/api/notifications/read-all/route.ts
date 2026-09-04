import { ok } from "@/lib/utils/response";
import { authed } from "@/lib/middleware/guards";
import * as notifications from "@/lib/services/notifications.staff.service";

export const dynamic = "force-dynamic";

// POST /api/v1/notifications/read-all → mark every unread notification read.
// What the bell's "قراءة الكل" control calls; no body. Scoped to the caller's
// own rows, so there is no way to clear anyone else's.
export const POST = authed(async (_request, _context, user) => {
  await notifications.markAllRead(user.id);
  return ok({ cleared: true });
});
