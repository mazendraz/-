-- Service Completion & Final Price Verification.
--
-- One row per Lead, created once the provider marks a lead "done" with a final
-- amount; leadId is UNIQUE so a second completion attempt is a DB-level 409, not
-- just an application check. verificationStatus starts PENDING and moves to
-- CONFIRMED/DISCREPANCY exactly once (see leadCompletion.service.verify, which
-- claims the transition with a conditional UPDATE the same way
-- reviews.service.submitFromLead claims Lead.reviewedAt).

CREATE TYPE "LeadVerificationStatus" AS ENUM ('PENDING', 'CONFIRMED', 'DISCREPANCY');

CREATE TABLE "LeadCompletion" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "providerAmount" INTEGER NOT NULL,
    "additionalWorkDescription" TEXT,
    "additionalWorkAmount" INTEGER,
    "notes" TEXT,
    "attachments" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verificationStatus" "LeadVerificationStatus" NOT NULL DEFAULT 'PENDING',
    "clientAmount" INTEGER,
    "discrepancyNote" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadCompletion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LeadCompletion_leadId_key" ON "LeadCompletion"("leadId");

CREATE INDEX "LeadCompletion_verificationStatus_idx" ON "LeadCompletion"("verificationStatus");

ALTER TABLE "LeadCompletion"
    ADD CONSTRAINT "LeadCompletion_leadId_fkey"
    FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
