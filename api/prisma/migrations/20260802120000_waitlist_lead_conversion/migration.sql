-- Links WaitlistEntry -> Lead so accepting a waitlist entry can create (and be
-- traced back to) the same Lead row used everywhere else in the CRM pipeline.
-- Nullable + SetNull: existing rows have no converted lead yet, and deleting the
-- resulting Lead later must not delete this waitlist history row.

-- AlterTable
ALTER TABLE "WaitlistEntry" ADD COLUMN     "convertedLeadId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "WaitlistEntry_convertedLeadId_key" ON "WaitlistEntry"("convertedLeadId");

-- AddForeignKey
ALTER TABLE "WaitlistEntry" ADD CONSTRAINT "WaitlistEntry_convertedLeadId_fkey" FOREIGN KEY ("convertedLeadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;
