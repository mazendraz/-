-- CreateTable
CREATE TABLE "BusyWindow" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "note" TEXT,
    "createdByAdmin" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusyWindow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BusyWindow_companyId_startsAt_idx" ON "BusyWindow"("companyId", "startsAt");

-- AddForeignKey
ALTER TABLE "BusyWindow" ADD CONSTRAINT "BusyWindow_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
