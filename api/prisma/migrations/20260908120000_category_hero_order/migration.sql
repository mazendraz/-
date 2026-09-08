-- AlterTable: curate + order which categories show in the homepage hero.
-- NULL (every existing row) = not shown in the hero; a number both opts in
-- and fixes the display position (ascending).
ALTER TABLE "Category" ADD COLUMN "heroOrder" INTEGER;

-- CreateIndex
CREATE INDEX "Category_heroOrder_idx" ON "Category"("heroOrder");
