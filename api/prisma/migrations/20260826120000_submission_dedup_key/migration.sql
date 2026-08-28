-- Concurrency guard for the two PUBLIC submission paths: POST /leads and the
-- waiting-list join. Both already rejected a near-identical re-submit by querying
-- for one inside a sliding window, but read-then-write cannot survive concurrency:
-- simultaneous copies of one request all read "nothing yet" and all insert.
-- Measured before this migration, twenty simultaneous copies of one request
-- produced seventeen orders, and ten simultaneous waiting-list joins produced two
-- queue entries.
--
-- dedupKey is a hash of (companyId, phone, service, 5-minute bucket) written by
-- the service layer (see src/lib/utils/dedupKey.ts). The UNIQUE index is what
-- actually decides the race; the existing window query stays as the layer that
-- produces a readable 409 and catches a re-submit straddling a bucket boundary.
--
-- NULLABLE, and populated only by the public paths. Postgres treats NULLs as
-- distinct in a unique index, so:
--   • every existing row is unaffected — this migration backfills nothing and
--     can never fail on historic duplicates;
--   • a lead created by a waiting-list accept stays NULL. That path has its own
--     atomic claim (waitlist.service.convertToLead) and must not be blocked by a
--     direct submission the same customer happened to make minutes earlier.
ALTER TABLE "Lead" ADD COLUMN "dedupKey" TEXT;
ALTER TABLE "WaitlistEntry" ADD COLUMN "dedupKey" TEXT;

CREATE UNIQUE INDEX "Lead_dedupKey_key" ON "Lead"("dedupKey");
CREATE UNIQUE INDEX "WaitlistEntry_dedupKey_key" ON "WaitlistEntry"("dedupKey");
