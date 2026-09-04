import { ok } from "@/lib/utils/response";
import { authed } from "@/lib/middleware/guards";
import * as notifications from "@/lib/services/notifications.staff.service";

export const dynamic = "force-dynamic";

// GET /api/v1/notifications/unread-count → { unreadCount }.
//
// Separate from the list route because the two have very different call
// frequencies: the badge is refreshed on every SSE event and on focus, while
// the list is only fetched when someone actually opens the bell. Serving the
// badge from the list endpoint would ship 50 rows of title/body text to render
// one number.
export const GET = authed(async (_request, _context, user) =>
  ok({ unreadCount: await notifications.unreadCount(user.id) }, 200, {
    "Cache-Control": "no-store",
  }),
);
