-- A fixed commission amount per company, as an alternative to the percentage.
--
-- Nullable and additive: every existing company keeps resolving exactly as it
-- did (its own percent, else the platform default). Only a company this column
-- is explicitly set on changes behaviour.
--
-- Set one or the other, never both — PATCH /admin/companies/[id]/commission
-- clears the other side on every write, so the pair cannot end up populated
-- together and leave "which one applies" to be guessed.
ALTER TABLE "Company" ADD COLUMN "commissionFlat" INTEGER;
