import type { NextRequest } from "next/server";
import { withErrors } from "@/lib/utils/withErrors";
import { withMaintenance } from "@/lib/middleware/maintenance";
import { ok } from "@/lib/utils/response";
import { readJsonObject } from "@/lib/middleware/bodyLimit";
import { withCustomerAuth } from "@/lib/middleware/withCustomerAuth";
import { updateCustomerNotificationPreferencesSchema } from "@/lib/validation/customerNotifications";
import * as notificationsService from "@/lib/services/notifications.customer.service";

export const dynamic = "force-dynamic";

// GET/PATCH /api/v1/customer/notification-preferences → the marketing
// opt-out (LEAD_CREATED/LEAD_STATUS/LEAD_COMPLETED/CHAT_MESSAGE/
// WAITLIST_NOTIFIED are never gated by this — see notifyCustomer's own
// comment). Own endpoint rather than folded into PATCH /customer/me: this is
// a notification-delivery preference, not profile data, matching the same
// separation the admin side already draws with /admin/notification-settings.
export const GET = withErrors(
  withCustomerAuth(async (_request, _context, customer) =>
    ok(await notificationsService.getPreferences(customer.id), 200, { "Cache-Control": "no-store" }),
  ),
);

export const PATCH = withErrors(
  withMaintenance(
    withCustomerAuth(async (request: NextRequest, _context, customer) => {
      const patch = updateCustomerNotificationPreferencesSchema.parse(await readJsonObject(request));
      return ok(await notificationsService.setPreferences(customer.id, patch));
    }),
  ),
);
