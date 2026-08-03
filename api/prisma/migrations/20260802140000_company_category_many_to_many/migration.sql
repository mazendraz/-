-- Company <-> Category: one-to-many -> many-to-many, via a new junction table.
-- Zero data loss: every existing Company.categoryId becomes an isPrimary=true
-- CompanyCategory row BEFORE the old column is dropped.
--
-- ORDER MATTERS in this file (create table -> backfill -> drop column). Do NOT
-- regenerate this migration from a fresh `prisma migrate diff` — the naive diff
-- drops "categoryId" before the junction table exists, which loses every
-- company's category. If this schema needs to change again, write a NEW
-- migration on top of this one instead of touching this file.

-- 1. New junction table + indexes + FKs.
CREATE TABLE "CompanyCategory" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyCategory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CompanyCategory_companyId_categoryId_key" ON "CompanyCategory"("companyId", "categoryId");
CREATE INDEX "CompanyCategory_categoryId_idx" ON "CompanyCategory"("categoryId");
CREATE INDEX "CompanyCategory_companyId_idx" ON "CompanyCategory"("companyId");

ALTER TABLE "CompanyCategory" ADD CONSTRAINT "CompanyCategory_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompanyCategory" ADD CONSTRAINT "CompanyCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 2. Backfill BEFORE the old column is dropped — one row per existing company,
-- marked as its (only, hence primary) category.
INSERT INTO "CompanyCategory" ("id", "companyId", "categoryId", "isPrimary", "createdAt")
SELECT gen_random_uuid(), "id", "categoryId", true, "createdAt" FROM "Company";

-- 3. Drop the old scalar FK/column now that every company has a junction row.
ALTER TABLE "Company" DROP CONSTRAINT "Company_categoryId_fkey";
DROP INDEX "Company_categoryId_idx";
ALTER TABLE "Company" DROP COLUMN "categoryId";

-- 4. Exactly one primary category per company, enforced at the DB level. Safe
-- here because step 2 already gave every company exactly one isPrimary=true row.
-- Same technique as change_request_one_pending (a partial unique index Prisma's
-- schema language can't express).
CREATE UNIQUE INDEX "company_category_one_primary" ON "CompanyCategory" ("companyId") WHERE "isPrimary" = true;
