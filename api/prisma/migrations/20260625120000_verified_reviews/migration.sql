-- AlterTable: mark whether a review came from a real customer on a completed lead
ALTER TABLE "Review" ADD COLUMN "verified" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: single-use marker for the one-time customer review flow
ALTER TABLE "Lead" ADD COLUMN "reviewedAt" TIMESTAMP(3);
