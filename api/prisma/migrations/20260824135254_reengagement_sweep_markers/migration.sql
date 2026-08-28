-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "staleNudgeSentAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "LeadCompletion" ADD COLUMN     "reviewRequestSentAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "LeadCompletion_verifiedAt_reviewRequestSentAt_idx" ON "LeadCompletion"("verifiedAt", "reviewRequestSentAt");
