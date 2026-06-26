-- AlterTable: optional per-page SEO overrides (admin-set). Null → frontend uses
-- the label/name-derived defaults.
ALTER TABLE "Category" ADD COLUMN "metaTitle" TEXT;
ALTER TABLE "Category" ADD COLUMN "metaDescription" TEXT;

ALTER TABLE "Company" ADD COLUMN "metaTitle" TEXT;
ALTER TABLE "Company" ADD COLUMN "metaDescription" TEXT;
