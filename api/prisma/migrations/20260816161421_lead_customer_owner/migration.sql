-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "customerId" TEXT;

-- CreateIndex
CREATE INDEX "Lead_customerId_createdAt_idx" ON "Lead"("customerId", "createdAt");

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "CustomerUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
