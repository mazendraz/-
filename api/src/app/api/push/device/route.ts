import type { NextRequest } from "next/server";
import { withErrors } from "@/lib/utils/withErrors";
import { withMaintenance } from "@/lib/middleware/maintenance";
import { ok } from "@/lib/utils/response";
import { readJsonObject } from "@/lib/middleware/bodyLimit";
import { withAuth } from "@/lib/middleware/withAuth";
import { pushDeviceSchema, pushDeviceUnregisterSchema } from "@/lib/validation/pushDevice";
import * as expoPush from "@/lib/services/expoPush.service";

export const dynamic = "force-dynamic";

// POST /api/v1/push/device → register this phone for the BUSINESS app (staff).
//
// The provider half of the mobile plan is the one that earns its keep: a lead
// arriving while they are on site, on a phone in their pocket, instead of the
// next time they happen to open a browser.
//
// See the customer route for why this is a separate file rather than a branch.
export const POST = withErrors(
  withMaintenance(
  withAuth(async (request: NextRequest, _context, user) => {
    const payload = pushDeviceSchema.parse(await readJsonObject(request, 4096));
    await expoPush.registerDevice({ ...payload, userId: user.id });
    return ok({ registered: true });
  }),
  ),
);

// DELETE /api/v1/push/device — forget this phone. What sign-out calls.
export const DELETE = withErrors(
  withMaintenance(
  withAuth(async (request: NextRequest) => {
    const { token } = pushDeviceUnregisterSchema.parse(await readJsonObject(request, 4096));
    await expoPush.unregisterDevice(token);
    return ok({ unregistered: true });
  }),
  ),
);
