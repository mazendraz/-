import type { NextRequest } from "next/server";
import { withErrors } from "@/lib/utils/withErrors";
import { withMaintenance } from "@/lib/middleware/maintenance";
import { ok } from "@/lib/utils/response";
import { withCustomerAuth } from "@/lib/middleware/withCustomerAuth";
import * as notificationsService from "@/lib/services/notifications.customer.service";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// PATCH /api/v1/customer/notifications/[id] → mark one notification read. No
// body (there is only the one transition — read). Ownership-checked inside
// the service; another account's id 404s the same way a missing one does.
export const PATCH = withErrors(
  withMaintenance(
    withCustomerAuth(async (_request: NextRequest, context: Ctx, customer) => {
      const { id } = await context.params;
      await notificationsService.markRead(customer.id, id);
      return ok({ read: true });
    }),
  ),
);
