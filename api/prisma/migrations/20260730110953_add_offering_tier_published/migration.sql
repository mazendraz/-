-- Draft flag for offering tiers.
--
-- A tier carries its own price and that price OVERRIDES the offering's for the
-- line it matches, so adding one to a published offering changed public pricing
-- with no review. This closes that path: false = a draft, and the generic
-- PUBLISH change-request flips it.
--
-- AlterTable
ALTER TABLE "OfferingTier" ADD COLUMN     "isPublished" BOOLEAN NOT NULL DEFAULT false;

-- Backfill. Every tier that exists right now is ALREADY visible on its company's
-- public profile — the column did not exist, so nothing gated it. Leaving them at
-- the `false` default would silently strip published price bands off live profiles
-- the moment this deploys, which is a worse bug than the one being fixed.
--
-- All rows, not just those under published offerings: a tier under a draft
-- offering is gated by the parent anyway, and it is reviewed as part of that
-- offering's PUBLISH request. Marking it true keeps it visible when the parent
-- goes live, which is what the admin approved.
UPDATE "OfferingTier" SET "isPublished" = true;
