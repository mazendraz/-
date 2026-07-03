-- Composite indexes for the hottest read paths, added ahead of scale. Cheap at
-- current volume (a small per-write maintenance cost); they let the filter AND the
-- ORDER BY be served from a single index once these tables grow.
--
-- Reviews: public/company listing — WHERE companyId=? AND approved=true
--          ORDER BY createdAt DESC.
CREATE INDEX "Review_companyId_approved_createdAt_idx" ON "Review"("companyId", "approved", "createdAt");

-- Leads: provider/admin dashboards — WHERE companyId=? [AND status=?]
--        ORDER BY createdAt DESC.
CREATE INDEX "Lead_companyId_status_createdAt_idx" ON "Lead"("companyId", "status", "createdAt");

-- NOTE: at large table sizes, build these with CREATE INDEX CONCURRENTLY (outside a
-- migration transaction) to avoid locking writes. At current volume a plain CREATE
-- is effectively instant.
