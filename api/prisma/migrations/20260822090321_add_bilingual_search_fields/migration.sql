-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "descriptionAr" TEXT,
ADD COLUMN     "labelAr" TEXT;

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "nameAr" TEXT;

-- AlterTable
ALTER TABLE "Offering" ADD COLUMN     "descriptionAr" TEXT,
ADD COLUMN     "nameAr" TEXT,
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];
