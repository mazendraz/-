import { ok } from "@/lib/utils/response";
import { adminOnly } from "@/lib/middleware/guards";
import { createAdminLinkUrl } from "@/lib/services/telegram.service";

export const dynamic = "force-dynamic";

export interface AdminTelegramLink {
  /** t.me deep link to open, or null when Telegram isn't configured server-side. */
  url: string | null;
}

// POST /api/admin/telegram/link → mint a single-use deep link that connects the
// caller's own admin account to whichever Telegram account opens it. POST (not
// GET) because it mints and stores a fresh token, superseding any previous one.
//
// The token is the credential here: anyone who opens the link within its
// 15-minute window gets bound to this admin's alerts, so the URL is returned
// only to the authenticated admin and must not be shared onward.
export const POST = adminOnly(async (_request, _ctx, user) => {
  return ok<AdminTelegramLink>({ url: await createAdminLinkUrl(user.id) });
});
