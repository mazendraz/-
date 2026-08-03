import { ok } from "@/lib/utils/response";
import { adminOnly } from "@/lib/middleware/guards";
import { prisma } from "@/lib/prisma";
import { isTelegramLinkingConfigured, unlinkAdmin } from "@/lib/services/telegram.service";

export const dynamic = "force-dynamic";

export interface AdminTelegramStatus {
  /** Server can actually issue deep links (bot token + username both set). */
  configured: boolean;
  /** This admin has a Telegram chat bound to their own account. */
  linked: boolean;
}

// GET /api/admin/telegram → whether the caller (an admin) is connected to
// Telegram, for rendering the settings page's connect/disconnect control.
// Deliberately returns only booleans: the chat id is internal and never needs
// to reach the browser.
export const GET = adminOnly(async (_request, _ctx, user) => {
  const me = await prisma.user.findUnique({
    where: { id: user.id },
    select: { telegramChatId: true },
  });

  return ok<AdminTelegramStatus>({
    configured: isTelegramLinkingConfigured(),
    linked: Boolean(me?.telegramChatId),
  });
});

// DELETE /api/admin/telegram → disconnect Telegram for the caller's own admin
// account. Idempotent: disconnecting when already disconnected is a no-op success.
export const DELETE = adminOnly(async (_request, _ctx, user) => {
  await unlinkAdmin(user.id);
  return ok<AdminTelegramStatus>({
    configured: isTelegramLinkingConfigured(),
    linked: false,
  });
});
