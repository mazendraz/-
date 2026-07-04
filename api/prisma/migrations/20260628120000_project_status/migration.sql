-- Portfolio project moderation. Provider-submitted projects start PENDING and only
-- appear publicly once an admin sets them APPROVED. New rows default to PENDING;
-- existing projects were already live, so they are backfilled to APPROVED.
CREATE TYPE "ProjectStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

ALTER TABLE "Project" ADD COLUMN "status" "ProjectStatus" NOT NULL DEFAULT 'PENDING';

UPDATE "Project" SET "status" = 'APPROVED';

CREATE INDEX "Project_status_idx" ON "Project"("status");
