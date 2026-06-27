import type { NextRequest } from "next/server";
import { ok } from "@/lib/utils/response";
import { authed } from "@/lib/middleware/guards";
import { ValidationError } from "@/lib/utils/errors";
import { pushUnsubscribeSchema } from "@/lib/validation/push";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// POST /api/push/unsubscribe → remove the given device subscription. Scoped to the
// caller's own subscriptions so one user can't delete another's. Idempotent: a
// missing endpoint is a no-op (still 200).
export const POST = authed(async (request: NextRequest, _ctx, user) => {
  const raw = await request.json().catch(() => null);
  if (raw === null || typeof raw !== "object") {
    throw new ValidationError("Request body must be a JSON object");
  }
  const { endpoint } = pushUnsubscribeSchema.parse(raw);

  await prisma.pushSubscription.deleteMany({
    where: { endpoint, userId: user.id },
  });

  return ok({ ok: true });
});
