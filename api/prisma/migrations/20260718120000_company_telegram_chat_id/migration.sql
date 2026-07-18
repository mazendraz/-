-- AlterTable: Telegram chat id for the provider, captured when they link the bot
-- by sharing their phone (matched against phone/whatsapp). Null → not linked, so
-- Telegram lead alerts are skipped for them (Web Push still applies).
ALTER TABLE "Company" ADD COLUMN "telegramChatId" TEXT;
