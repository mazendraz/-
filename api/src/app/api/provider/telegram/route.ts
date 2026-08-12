import { ok } from "@/lib/utils/response";
import { providerOnly } from "@/lib/middleware/guards";
import { ForbiddenError } from "@/lib/utils/errors";
import { prisma } from "@/lib/prisma";
import {
  isTelegramLinkingConfigured,
  unlinkProvider,
  removeProviderChat,
  MAX_COMPANY_TELEGRAM_CHATS,
} from "@/lib/services/telegram.service";

export const dynamic = "force-dynamic";

/** One linked Telegram account, as shown in the dashboard list. */
export interface ProviderTelegramChat {
  /** Row id — what DELETE takes to remove this one account. */
  id: string;
  /** Telegram display name captured at link time; null for pre-multi-chat rows. */
  label: string | null;
  linkedAt: string;
}

export interface ProviderTelegramStatus {
  /** Server can actually issue deep links (bot token + username both set). */
  configured: boolean;
  /** At least one Telegram account is bound to this company. */
  linked: boolean;
  /** Every linked account, so the provider can see and remove them individually. */
  chats: ProviderTelegramChat[];
  /** How many accounts one company may link. */
  max: number;
}

async function statusFor(companyId: string): Promise<ProviderTelegramStatus> {
  const rows = await prisma.companyTelegramChat.findMany({
    where: { companyId },
    // Note the absence of chatId: it's internal and never needs to reach the
    // browser — the row id is enough to delete one.
    select: { id: true, label: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  return {
    configured: isTelegramLinkingConfigured(),
    linked: rows.length > 0,
    chats: rows.map((r) => ({
      id: r.id,
      label: r.label,
      linkedAt: r.createdAt.toISOString(),
    })),
    max: MAX_COMPANY_TELEGRAM_CHATS,
  };
}

// GET /api/provider/telegram → which Telegram accounts the caller's company has
// connected, for rendering the dashboard's list + connect control.
export const GET = providerOnly(async (_request, _ctx, user) => {
  if (!user.companyId) throw new ForbiddenError("Your account is not linked to a company");
  return ok<ProviderTelegramStatus>(await statusFor(user.companyId));
});

// DELETE /api/provider/telegram        → disconnect every linked account
// DELETE /api/provider/telegram?id=xxx → disconnect just that one
// Idempotent either way: deleting something already gone is a no-op success.
export const DELETE = providerOnly(async (request, _ctx, user) => {
  if (!user.companyId) throw new ForbiddenError("Your account is not linked to a company");

  const id = new URL(request.url).searchParams.get("id");
  if (id) {
    // Scoped to the caller's company inside removeProviderChat, so a guessed uuid
    // from another company deletes nothing.
    await removeProviderChat(user.companyId, id);
  } else {
    await unlinkProvider(user.companyId);
  }

  return ok<ProviderTelegramStatus>(await statusFor(user.companyId));
});
