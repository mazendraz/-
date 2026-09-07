-- Why a request was cancelled.
--
-- Additive and nullable on purpose. Every lead already in the table keeps its
-- exact current state: the ones that were never cancelled have nothing to
-- explain, and the ones cancelled before today have no honest answer to give —
-- backfilling them with a guessed reason would put invented data in the one
-- column whose whole value is that it is not invented. They stay NULL and read
-- as "cancelled before we started asking".
--
-- Going forward the API refuses a move to CANCELLED without a reason (see
-- leads.service.updateStatus), so NULL and CANCELLED together identifies
-- exactly the pre-existing rows and nothing else.

CREATE TYPE "LeadLossReason" AS ENUM (
  'PRICE',
  'NO_RESPONSE',
  'CHOSE_COMPETITOR',
  'TIMING',
  'OUT_OF_SCOPE',
  'DUPLICATE',
  'CUSTOMER_CHANGED_MIND',
  'OTHER'
);

ALTER TABLE "Lead" ADD COLUMN "lossReason" "LeadLossReason";
ALTER TABLE "Lead" ADD COLUMN "lossNote" TEXT;

-- Serves "what did we lose to, and when" — the report this column exists for.
CREATE INDEX "Lead_lossReason_createdAt_idx" ON "Lead"("lossReason", "createdAt");
