import { withErrors } from "@/lib/utils/withErrors";
import { ok } from "@/lib/utils/response";
import { withCustomerAuth } from "@/lib/middleware/withCustomerAuth";
import * as notificationsService from "@/lib/services/notifications.customer.service";

export const dynamic = "force-dynamic";

// GET /api/v1/customer/notifications → this account's notification center:
// latest rows + unread count. Backs the mobile app's Notifications screen and
// the bell/badge shown elsewhere in the shell.
export const GET = withErrors(
  withCustomerAuth(async (_request, _context, customer) =>
    ok(await notificationsService.listNotifications(customer.id), 200, { "Cache-Control": "no-store" }),
  ),
);
