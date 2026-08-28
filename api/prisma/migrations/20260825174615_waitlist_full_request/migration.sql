-- AlterTable
ALTER TABLE "WaitlistEntry" ADD COLUMN     "budget" TEXT,
ADD COLUMN     "district" TEXT,
ADD COLUMN     "itemsSnapshot" JSONB;
