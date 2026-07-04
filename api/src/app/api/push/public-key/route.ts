import { ok } from "@/lib/utils/response";
import { authed } from "@/lib/middleware/guards";
import { getVapidPublicKey } from "@/lib/services/push.service";

export const dynamic = "force-dynamic";

// GET /api/push/public-key → { publicKey } for the current user to build a push
// subscription, or { publicKey: null } when push is not configured on the server
// (the frontend then hides the "enable notifications" UI).
export const GET = authed(async () => {
  return ok({ publicKey: getVapidPublicKey() });
});
