-- Customer-review moderation. Customer submissions start unapproved (hidden and
-- excluded from the rating aggregate) until an admin approves them. New rows
-- default false; existing reviews were already live, so they are backfilled to true.
ALTER TABLE "Review" ADD COLUMN "approved" BOOLEAN NOT NULL DEFAULT false;

UPDATE "Review" SET "approved" = true;

CREATE INDEX "Review_approved_idx" ON "Review"("approved");
