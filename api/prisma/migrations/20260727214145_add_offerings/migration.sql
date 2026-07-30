-- CreateEnum
CREATE TYPE "OfferingKind" AS ENUM ('SERVICE', 'PRODUCT');

-- CreateEnum
CREATE TYPE "PricingModel" AS ENUM ('FIXED', 'RANGE', 'PER_UNIT', 'ON_INSPECTION');

-- CreateEnum
CREATE TYPE "PriceUnit" AS ENUM ('SQM', 'METER', 'PIECE', 'DOOR', 'WINDOW', 'ROOM', 'APARTMENT', 'HOUR', 'DAY', 'JOB');

-- CreateTable
CREATE TABLE "Offering" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "kind" "OfferingKind" NOT NULL DEFAULT 'SERVICE',
    "pricingModel" "PricingModel" NOT NULL DEFAULT 'RANGE',
    "priceMin" INTEGER,
    "priceMax" INTEGER,
    "unit" "PriceUnit",
    "minQty" INTEGER,
    "image" TEXT,
    "note" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "migratedFromService" TEXT,
    "priceUpdatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Offering_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfferingTier" (
    "id" TEXT NOT NULL,
    "offeringId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "qtyMin" INTEGER,
    "qtyMax" INTEGER,
    "priceMin" INTEGER,
    "priceMax" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "OfferingTier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BundleRule" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "label" TEXT,
    "minItems" INTEGER NOT NULL,
    "discountPercent" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BundleRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Offering_companyId_isPublished_isActive_sortOrder_idx" ON "Offering"("companyId", "isPublished", "isActive", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "Offering_companyId_migratedFromService_key" ON "Offering"("companyId", "migratedFromService");

-- CreateIndex
CREATE INDEX "OfferingTier_offeringId_sortOrder_idx" ON "OfferingTier"("offeringId", "sortOrder");

-- CreateIndex
CREATE INDEX "BundleRule_companyId_isActive_idx" ON "BundleRule"("companyId", "isActive");

-- AddForeignKey
ALTER TABLE "Offering" ADD CONSTRAINT "Offering_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfferingTier" ADD CONSTRAINT "OfferingTier_offeringId_fkey" FOREIGN KEY ("offeringId") REFERENCES "Offering"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BundleRule" ADD CONSTRAINT "BundleRule_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
