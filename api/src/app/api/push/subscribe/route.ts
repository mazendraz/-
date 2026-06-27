import type { NextRequest } from "next/server";
import { ok } from "@/lib/utils/response";
import { authed } from "@/lib/middleware/guards";
import { ValidationError } from "@/lib/utils/errors";
import { pushSubscribeSchema } from "@/lib/validation/push";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// POST /api/push/subscribe → save (or move) the caller's browser push subscription
// against their user account. Idempotent on `endpoint` (unique): re-subscribing the
// same device updates its keys and re-points it at the current user.
export const POST = authed(async (request: NextRequest, _ctx, user) => {
  const raw = await request.json().catch(() => null);
  if (raw === null || typeof raw !== "object") {
    throw new ValidationError("Request body must be a JSON object");
  }
  const sub = pushSubscribeSchema.parse(raw);
  const userAgent = request.headers.get("user-agent")?.slice(0, 255) ?? null;

  await prisma.pushSubscription.upsert({
    where: { endpoint: sub.endpoint },
    create: {
      userId: user.id,
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
      userAgent,
    },
    update: {
      userId: user.id,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
      userAgent,
    },
  });

  return ok({ ok: true }, 201);
});
