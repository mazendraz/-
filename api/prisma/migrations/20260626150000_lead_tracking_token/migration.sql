-- AlterTable: high-entropy secret gating public lead tracking + the one-time
-- review (replaces the guessable phone number). Nullable — leads created before
-- this column fall back to phone-tail matching.
ALTER TABLE "Lead" ADD COLUMN "trackingToken" TEXT;
