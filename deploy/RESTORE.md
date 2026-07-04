# Restore & Disaster Recovery — Al Assema

Backups you have never restored are hopes, not backups. This runbook covers (1) how
to restore, and (2) a **rehearsal you must run at least once before launch** and
after any major schema change. Fill in the "Last rehearsed" line at the bottom when
you do.

Backups are produced by [`deploy/backup.sh`](backup.sh): a nightly `pg_dump`
(custom format) uploaded off-site via `rclone`, plus an optional mirror of the
Supabase Storage image buckets.

---

## What is backed up, and the recovery targets

| Asset | Backup | RPO (max data loss) | RTO (time to restore) |
| --- | --- | --- | --- |
| Postgres (all business data) | Supabase daily backup **+** nightly off-site `pg_dump` | ≤ 24 h (tighten with Supabase PITR) | ~15–30 min |
| Supabase Storage (images) | Supabase-managed **+** optional `rclone` mirror | ≤ 24 h | minutes (re-point URLs) or re-sync |
| App code | Git (GitHub) | 0 | minutes (`deploy.sh`) |
| Secrets (`api/.env`) | **NOT in git** — store in a password manager | — | manual |

> ⚠️ `api/.env` is intentionally git-ignored. Keep a copy in your password manager;
> a server loss without it means regenerating `JWT_SECRET` (logs everyone out) and
> re-entering every key. This is part of DR, not an afterthought.

---

## A. Restore the database (real incident)

Restoring **overwrites** the target database. Never point this at production unless
production is already lost and you are deliberately rebuilding it.

```bash
# 1. Fetch the dump you want (list, then copy the chosen one down)
rclone lsl b2:alassema-backups/db/
rclone copy b2:alassema-backups/db/alassema-db-2026-07-03T030000.dump /tmp/

# 2. Restore into the TARGET database. --clean --if-exists drops objects first so a
#    partially-populated target is replaced cleanly. Use the DIRECT/session URL.
pg_restore \
  --no-owner --no-privileges \
  --clean --if-exists \
  --dbname "$TARGET_DATABASE_URL" \
  /tmp/alassema-db-2026-07-03T030000.dump

# 3. Point the app at the restored DB (api/.env DATABASE_URL) and restart
pm2 reload alassema-api
curl -s https://your-domain.com/api/ready   # expect {"ok":true,"db":"up"}
```

If you use **Supabase PITR / dashboard backups** instead of the dump for the DB,
restore from the Supabase dashboard (Database → Backups) and skip steps 1–2.

### Storage (images)

If image buckets were lost and you kept the mirror:

```bash
for b in logos covers gallery projects; do
  rclone sync b2:alassema-backups/storage/$b/ supabase-s3:$b
done
```

Image URLs stored in the DB are absolute Supabase URLs, so once the buckets and
objects exist again at the same paths, existing pages resolve without a data change.

---

## B. Rehearsal (do this before launch — it is the real deliverable)

Rehearse into a **throwaway** database so production is never touched.

```bash
# 1. Create a scratch Supabase project (free) OR a local Postgres:
#    docker run -d --name pg-restore-test -e POSTGRES_PASSWORD=pw -p 5544:5432 postgres:16
#    SCRATCH_URL="postgresql://postgres:pw@localhost:5544/postgres"

# 2. Pull last night's dump and restore into the scratch DB
rclone copy b2:alassema-backups/db/$(rclone lsf b2:alassema-backups/db/ | sort | tail -1) /tmp/
pg_restore --no-owner --no-privileges --clean --if-exists \
  --dbname "$SCRATCH_URL" /tmp/alassema-db-*.dump

# 3. Sanity-check the data actually came back
psql "$SCRATCH_URL" -c "select
  (select count(*) from \"Company\") as companies,
  (select count(*) from \"Lead\")    as leads,
  (select count(*) from \"Review\")  as reviews,
  (select count(*) from \"User\")    as users;"

# 4. (Optional but convincing) point a local api/ at $SCRATCH_URL, run it, log in,
#    confirm companies + leads render in the dashboard.

# 5. Tear down the scratch DB.
```

**Pass criteria:** step 3 shows non-zero, plausible counts, and (if done) step 4
renders real data. Record the result below.

---

## Rehearsal log

| Date | Dump restored | Row counts (co/leads/reviews/users) | Time taken | By |
| --- | --- | --- | --- | --- |
| _pending — do before launch_ | | | | |

---

## Fast reference — "everything is down"

1. **DB corrupt/wrong data** → Section A (restore last good dump into prod, or Supabase PITR).
2. **VPS dead** → new VPS, follow [`deploy/README.md`](README.md) §أ, restore `api/.env` from your password manager, `bash deploy/deploy.sh`. DB is remote (Supabase) so it's unaffected.
3. **Supabase project deleted/lost** → new Supabase project → restore DB (Section A) → restore Storage → update `api/.env` URLs/keys → redeploy.
4. **Bad migration shipped** → restore the pre-deploy dump (migrations are forward-only; there is no down-migration). This is why backups run nightly *and* why you keep the last 5 release dirs (Phase 3).
