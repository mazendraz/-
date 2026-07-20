-- Provider availability ("busy") + waiting list.
--
-- Company gains a busy flag with an optional auto-reopen instant (busyUntil) and an
-- optional customer-facing note. A company is only EFFECTIVELY busy while busy=true
-- AND busyUntil is null/future, so the reopen happens at read time (no cron).
ALTER TABLE "Company" ADD COLUMN "busy" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Company" ADD COLUMN "busyUntil" TIMESTAMP(3);
ALTER TABLE "Company" ADD COLUMN "busyNote" TEXT;

-- Waiting-list entries: customers who joined while a company was busy. Contact is
-- off-platform (phone), matching the lead-generation model.
CREATE TYPE "WaitlistStatus" AS ENUM ('WAITING', 'NOTIFIED', 'CONVERTED', 'CANCELLED');

CREATE TABLE "WaitlistEntry" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "service" TEXT,
    "note" TEXT,
    "status" "WaitlistStatus" NOT NULL DEFAULT 'WAITING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WaitlistEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WaitlistEntry_companyId_idx" ON "WaitlistEntry"("companyId");

-- CreateIndex
CREATE INDEX "WaitlistEntry_companyId_status_createdAt_idx" ON "WaitlistEntry"("companyId", "status", "createdAt");

-- AddForeignKey
ALTER TABLE "WaitlistEntry" ADD CONSTRAINT "WaitlistEntry_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
