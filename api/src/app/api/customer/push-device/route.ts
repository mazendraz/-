import type { NextRequest } from "next/server";
import { withErrors } from "@/lib/utils/withErrors";
import { withMaintenance } from "@/lib/middleware/maintenance";
import { ok } from "@/lib/utils/response";
import { readJsonObject } from "@/lib/middleware/bodyLimit";
import { withCustomerAuth } from "@/lib/middleware/withCustomerAuth";
import { pushDeviceSchema, pushDeviceUnregisterSchema } from "@/lib/validation/pushDevice";
import * as expoPush from "@/lib/services/expoPush.service";

export const dynamic = "force-dynamic";

// POST /api/v1/customer/push-device → register this phone for the CUSTOMER app.
//
// Called on every launch, not just the first: Expo rotates a token on reinstall
// and after some OS updates, and a client that registers once ends up
// unreachable with no way to notice. The service upserts, so repeats are free.
//
// Deliberately separate from the staff route next door even though the body is
// identical. Each route can only ever write its own side of the owner columns,
// which is what keeps a customer's phone from being registered against a staff
// account — a boundary made of two routes rather than an `if` inside one.
export const POST = withErrors(
  withMaintenance(
  withCustomerAuth(async (request: NextRequest, _context, customer) => {
    const payload = pushDeviceSchema.parse(await readJsonObject(request, 4096));
    await expoPush.registerDevice({ ...payload, customerId: customer.id });
    return ok({ registered: true });
  }),
  ),
);

// DELETE /api/v1/customer/push-device — forget this phone. What sign-out calls.
//
// Not scoped to the caller's account, and that is correct: the token IS the
// device. Anyone able to present it is holding the phone, and the only effect
// is that the phone stops receiving notifications. Refusing to unregister a
// token because the account had already been signed out would leave a device
// notified about an account it no longer has.
export const DELETE = withErrors(
  withMaintenance(
  withCustomerAuth(async (request: NextRequest) => {
    const { token } = pushDeviceUnregisterSchema.parse(await readJsonObject(request, 4096));
    await expoPush.unregisterDevice(token);
    return ok({ unregistered: true });
  }),
  ),
);
