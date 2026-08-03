-- Lets an ADMIN user self-link their own Telegram (same mechanism as Company's),
-- instead of every admin sharing one chat id hardcoded in TELEGRAM_ADMIN_CHAT_ID.

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "telegramChatId" TEXT,
ADD COLUMN     "telegramLinkExpires" TIMESTAMP(3),
ADD COLUMN     "telegramLinkToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_telegramLinkToken_key" ON "User"("telegramLinkToken");
