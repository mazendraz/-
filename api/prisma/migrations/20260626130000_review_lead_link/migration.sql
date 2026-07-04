-- AlterTable: link a verified review back to the completed lead it came from.
-- Nullable — curated/seeded admin reviews have no originating lead.
ALTER TABLE "Review" ADD COLUMN "leadId" TEXT;

-- One review per lead — enforces the one-time customer review invariant at the DB
-- level (backstops the transactional claim in reviews.service submitFromLead).
-- Postgres unique indexes permit multiple NULLs, so curated reviews don't collide.
CREATE UNIQUE INDEX "Review_leadId_key" ON "Review"("leadId");

-- AddForeignKey: deleting a lead unlinks (but keeps) its review. Deleting the
-- company cascades both lead and review via companyId, so there's no conflict.
ALTER TABLE "Review" ADD CONSTRAINT "Review_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;
