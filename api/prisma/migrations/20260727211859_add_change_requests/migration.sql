-- CreateEnum
CREATE TYPE "ChangeRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ChangeEntity" AS ENUM ('COMPANY', 'OFFERING', 'OFFERING_TIER', 'BUNDLE_RULE');

-- CreateEnum
CREATE TYPE "ChangeOperation" AS ENUM ('PUBLISH', 'UPDATE', 'DELETE');

-- CreateTable
CREATE TABLE "ChangeRequest" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "entity" "ChangeEntity" NOT NULL,
    "entityId" TEXT NOT NULL,
    "operation" "ChangeOperation" NOT NULL DEFAULT 'UPDATE',
    "submittedById" TEXT NOT NULL,
    "changes" JSONB NOT NULL,
    "snapshot" JSONB NOT NULL,
    "note" TEXT,
    "status" "ChangeRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChangeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChangeRequest_status_createdAt_idx" ON "ChangeRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ChangeRequest_companyId_status_idx" ON "ChangeRequest"("companyId", "status");

-- CreateIndex
CREATE INDEX "ChangeRequest_entity_entityId_status_idx" ON "ChangeRequest"("entity", "entityId", "status");

-- AddForeignKey
ALTER TABLE "ChangeRequest" ADD CONSTRAINT "ChangeRequest_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── At most ONE pending request per (entity, entityId) ────────────────────────
-- Hand-written: Prisma's schema language cannot express a PARTIAL unique index,
-- so this is not represented in schema.prisma. Do not remove it when regenerating
-- migrations.
--
-- A service-level check alone is not enough: a double-click or a retried submit
-- races between "is there a pending one?" and INSERT, and you end up with two
-- PENDING rows for the same entity. Then the admin approves one, the other stays
-- forever, and the merge logic has no single row to merge into.
--
-- This works ONLY because "entityId" is NOT NULL — Postgres treats every NULL as
-- distinct, so a nullable column would let duplicates straight through.
CREATE UNIQUE INDEX "change_request_one_pending"
  ON "ChangeRequest" ("entity", "entityId")
  WHERE "status" = 'PENDING';
