-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "lastMonthlySummaryPeriod" TEXT;

-- AlterTable
ALTER TABLE "CustomerUser" ADD COLUMN     "firstServiceNudgeSentAt" TIMESTAMP(3),
ADD COLUMN     "lastViewedCategoryAt" TIMESTAMP(3),
ADD COLUMN     "lastViewedCategoryLabel" TEXT,
ADD COLUMN     "lastViewedCategorySlug" TEXT;
