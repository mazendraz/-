-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "discountPercent" INTEGER DEFAULT 0,
ADD COLUMN     "estimatedMax" INTEGER,
ADD COLUMN     "estimatedMin" INTEGER,
ADD COLUMN     "hasOnInspection" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "LeadItem" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "offeringId" TEXT,
    "nameSnapshot" TEXT NOT NULL,
    "tierLabel" TEXT,
    "qty" INTEGER NOT NULL DEFAULT 1,
    "pricingModel" "PricingModel" NOT NULL,
    "unitPriceMin" INTEGER,
    "unitPriceMax" INTEGER,
    "lineMin" INTEGER,
    "lineMax" INTEGER,

    CONSTRAINT "LeadItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LeadItem_leadId_idx" ON "LeadItem"("leadId");

-- AddForeignKey
ALTER TABLE "LeadItem" ADD CONSTRAINT "LeadItem_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadItem" ADD CONSTRAINT "LeadItem_offeringId_fkey" FOREIGN KEY ("offeringId") REFERENCES "Offering"("id") ON DELETE SET NULL ON UPDATE CASCADE;
