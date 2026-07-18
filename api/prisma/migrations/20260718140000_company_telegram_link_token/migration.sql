-- AlterTable: single-use deep-link token for the dashboard's "Connect Telegram"
-- button. The provider opens t.me/<bot>?start=<token>; redeeming it proves which
-- company they are, so no phone matching is involved. Cleared on redemption and
-- ignored once expired. Unique so one token can only ever identify one company.
ALTER TABLE "Company" ADD COLUMN "telegramLinkToken" TEXT;
ALTER TABLE "Company" ADD COLUMN "telegramLinkExpires" TIMESTAMP(3);

CREATE UNIQUE INDEX "Company_telegramLinkToken_key" ON "Company"("telegramLinkToken");
