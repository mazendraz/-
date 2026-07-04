-- Admin manual rating override. When true, the company's rating/reviewCount were
-- set by an admin and the review-aggregate recompute leaves them untouched. When
-- cleared (false), the values are recomputed from the Review table again.
ALTER TABLE "Company" ADD COLUMN "ratingOverridden" BOOLEAN NOT NULL DEFAULT false;
