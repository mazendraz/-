import { ok } from "@/lib/utils/response";
import { providerOnly } from "@/lib/middleware/guards";
import { ForbiddenError } from "@/lib/utils/errors";
import { prisma } from "@/lib/prisma";
import { isTelegramLinkingConfigured, unlinkProvider } from "@/lib/services/telegram.service";

export const dynamic = "force-dynamic";

export interface ProviderTelegramStatus {
  /** Server can actually issue deep links (bot token + username both set). */
  configured: boolean;
  /** This company has a Telegram chat bound to it. */
  linked: boolean;
}

// GET /api/provider/telegram → whether the caller's company is connected to Telegram,
// for rendering the dashboard's connect/disconnect control. Deliberately returns only
// booleans: the chat id is internal and never needs to reach the browser.
export const GET = providerOnly(async (_request, _ctx, user) => {
  if (!user.companyId) throw new ForbiddenError("Your account is not linked to a company");

  const company = await prisma.company.findUnique({
    where: { id: user.companyId },
    select: { telegramChatId: true },
  });

  return ok<ProviderTelegramStatus>({
    configured: isTelegramLinkingConfigured(),
    linked: Boolean(company?.telegramChatId),
  });
});

// DELETE /api/provider/telegram → disconnect Telegram for the caller's own company.
// Idempotent: disconnecting when already disconnected is a no-op success.
export const DELETE = providerOnly(async (_request, _ctx, user) => {
  if (!user.companyId) throw new ForbiddenError("Your account is not linked to a company");

  await unlinkProvider(user.companyId);
  return ok<ProviderTelegramStatus>({
    configured: isTelegramLinkingConfigured(),
    linked: false,
  });
});
