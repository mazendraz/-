import { withErrors } from "@/lib/utils/withErrors";
import { withMaintenance } from "@/lib/middleware/maintenance";
import { ok } from "@/lib/utils/response";
import { withCustomerAuth } from "@/lib/middleware/withCustomerAuth";
import * as notificationsService from "@/lib/services/notifications.customer.service";

export const dynamic = "force-dynamic";

// POST /api/v1/customer/notifications/read-all → mark every unread
// notification read. What the notifications screen's "mark all as read"
// control calls; no body.
export const POST = withErrors(
  withMaintenance(
    withCustomerAuth(async (_request, _context, customer) => {
      await notificationsService.markAllRead(customer.id);
      return ok({ cleared: true });
    }),
  ),
);
