import { ok } from "@/lib/utils/response";
import { providerOnly } from "@/lib/middleware/guards";
import { ForbiddenError, ValidationError } from "@/lib/utils/errors";
import { prisma } from "@/lib/prisma";
import {
  createProviderLinkUrl,
  MAX_COMPANY_TELEGRAM_CHATS,
} from "@/lib/services/telegram.service";

export const dynamic = "force-dynamic";

export interface ProviderTelegramLink {
  /** t.me deep link to open, or null when Telegram isn't configured server-side. */
  url: string | null;
}

// POST /api/provider/telegram/link → mint a single-use deep link that connects the
// caller's own company to whichever Telegram account opens it. POST (not GET) because
// it mints and stores a fresh token, superseding any previous one.
//
// The token is the credential here: anyone who opens the link within its 15-minute
// window gets ADDED to this company's Telegram recipients, so the URL is returned
// only to the authenticated owner of that company and must not be shared onward.
export const POST = providerOnly(async (_request, _ctx, user) => {
  if (!user.companyId) throw new ForbiddenError("Your account is not linked to a company");

  // Refuse at the cap rather than minting a link that would be rejected on redemption
  // — telling them here is far clearer than letting the bot break the news.
  const count = await prisma.companyTelegramChat.count({ where: { companyId: user.companyId } });
  if (count >= MAX_COMPANY_TELEGRAM_CHATS) {
    throw new ValidationError(
      `You've reached the maximum of ${MAX_COMPANY_TELEGRAM_CHATS} linked Telegram accounts. Remove one first.`,
    );
  }

  return ok<ProviderTelegramLink>({ url: await createProviderLinkUrl(user.companyId) });
});
