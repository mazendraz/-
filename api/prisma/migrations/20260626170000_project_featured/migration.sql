-- AlterTable: curate a project for the homepage "Featured Projects" showcase.
ALTER TABLE "Project" ADD COLUMN "featured" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Project_featured_idx" ON "Project"("featured");
