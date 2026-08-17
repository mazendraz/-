-- AlterTable
ALTER TABLE "WaitlistEntry" ADD COLUMN     "customerId" TEXT;

-- CreateIndex
CREATE INDEX "WaitlistEntry_customerId_createdAt_idx" ON "WaitlistEntry"("customerId", "createdAt");

-- AddForeignKey
ALTER TABLE "WaitlistEntry" ADD CONSTRAINT "WaitlistEntry_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "CustomerUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

