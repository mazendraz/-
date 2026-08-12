-- Several Telegram accounts per company, replacing the single Company."telegramChatId".
--
-- The old column stays in place for now (one release of rollback headroom); the
-- backfill below copies whatever is in it into the new table so no provider who
-- was already linked stops receiving alerts on deploy.

CREATE TABLE "CompanyTelegramChat" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyTelegramChat_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CompanyTelegramChat_companyId_idx" ON "CompanyTelegramChat"("companyId");

-- Per company, not global: one Telegram account may serve two companies, but the
-- same account twice on one company would double every notification.
CREATE UNIQUE INDEX "CompanyTelegramChat_companyId_chatId_key" ON "CompanyTelegramChat"("companyId", "chatId");

ALTER TABLE "CompanyTelegramChat"
    ADD CONSTRAINT "CompanyTelegramChat_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill from the deprecated column. gen_random_uuid() is available in Postgres 13+
-- without an extension.
INSERT INTO "CompanyTelegramChat" ("id", "companyId", "chatId", "label", "createdAt")
SELECT gen_random_uuid()::text, c."id", c."telegramChatId", NULL, CURRENT_TIMESTAMP
FROM "Company" c
WHERE c."telegramChatId" IS NOT NULL AND c."telegramChatId" <> '';
