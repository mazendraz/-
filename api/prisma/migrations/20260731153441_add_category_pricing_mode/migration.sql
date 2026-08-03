-- Phase 9 — per-category pricing mode.
--
-- Additive only: new enum + a new column with a default, so every existing
-- category keeps behaving exactly as it does today (QUOTE_ONLY = no priced
-- catalog, chips + direct request, same as before this migration existed).
-- Nothing here touches Offering/OfferingTier/BundleRule data — the real
-- enforcement of this switch lives in application code (see
-- offerings.service.ts assertCatalogEnabled), not in the schema.

-- CreateEnum
CREATE TYPE "CategoryPricingMode" AS ENUM ('QUOTE_ONLY', 'FIXED_CATALOG');

-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "pricingMode" "CategoryPricingMode" NOT NULL DEFAULT 'QUOTE_ONLY';
