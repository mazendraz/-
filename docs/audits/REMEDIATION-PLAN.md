# Al Assema — Remediation Plan

Companion to [CTO-AUDIT.md](CTO-AUDIT.md). Every fix below is written against the actual code in this repo, with concrete steps and a verification check. Phases are ordered so that each one leaves the system strictly safer than the last, and the launch-blocking work is finished by the end of Phase 2.

**Total effort to launch-ready (end of Phase 2): roughly 3–4 working days.**

---

## Phase 0 — Quick code guards (half a day, do these first)

Small, isolated changes. No design decisions needed. Ship as one PR.

### 0.1 Guard the seed script (A-3)

**File:** [api/prisma/seed.ts](../../api/prisma/seed.ts)

Add before the first `deleteMany`:

```ts
// Refuse to wipe a database that already holds real business data unless the
// operator explicitly forces it. Leads are customer submissions — never seedable.
const leadCount = await prisma.lead.count();
const force = process.argv.includes("--force") || process.env.SEED_ALLOW_DESTRUCTIVE === "1";
if (leadCount > 0 && !force) {
  throw new Error(
    `Refusing to seed: database contains ${leadCount} lead(s). ` +
    `This script DELETES all companies, leads, and reviews. ` +
    `Re-run with --force (or SEED_ALLOW_DESTRUCTIVE=1) only if you truly intend that.`,
  );
}
```

**Verify:** run `npm run seed` against a DB with one lead → it aborts; with `--force` → it proceeds.

### 0.2 Enforce JWT secret strength (SEC-3)

**File:** [api/src/lib/auth.ts](../../api/src/lib/auth.ts) — extend `secretKey()`:

```ts
function secretKey(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set");
  if (process.env.NODE_ENV === "production" && secret.length < 32) {
    throw new Error(
      "JWT_SECRET is too short for production (need ≥32 chars). Generate one with: openssl rand -base64 32",
    );
  }
  return new TextEncoder().encode(secret);
}
```

(If you prefer failing at boot rather than first request, mirror the `rateLimitConfigError` pattern in [rateLimit.ts:111](../../api/src/lib/middleware/rateLimit.ts#L111) — a module-level check skipped during `NEXT_PHASE === "phase-production-build"`.)

**Verify:** unit test with a short secret + `NODE_ENV=production` → throws.

### 0.3 Verify the database TLS certificate (SEC-2)

1. Supabase Dashboard → **Settings → Database → SSL certificate** → download the CA (`prod-ca-2021.crt` or project CA).
2. Put it on the server at e.g. `/etc/ssl/supabase-ca.crt`, add to `.env.example`:

```bash
# Path to the Supabase CA certificate. When set, DB TLS is fully verified
# (sslmode=verify-full equivalent). Leave empty only in local dev.
DATABASE_SSL_CA_PATH=""
```

3. **File:** [api/src/lib/dbAdapter.ts](../../api/src/lib/dbAdapter.ts):

```ts
import { readFileSync } from "node:fs";

export function createPgAdapter(connectionString: string): PrismaPg {
  const url = new URL(connectionString);
  const sslmode = url.searchParams.get("sslmode");
  const wantsSsl = sslmode !== null && sslmode !== "disable";
  if (!wantsSsl) return new PrismaPg({ connectionString });

  url.searchParams.delete("sslmode");
  const caPath = process.env.DATABASE_SSL_CA_PATH;
  const ssl = caPath
    ? { ca: readFileSync(caPath, "utf8"), rejectUnauthorized: true }
    : { rejectUnauthorized: false }; // dev fallback — warn below
  if (!caPath && process.env.NODE_ENV === "production") {
    console.warn("[db] TLS certificate verification is OFF — set DATABASE_SSL_CA_PATH");
  }
  return new PrismaPg({ connectionString: url.toString(), ssl });
}
```

**Verify:** with the CA set, `/api/ready` returns `{ ok: true }`; with a wrong CA file, connection fails (proves verification is real).

### 0.4 Three trivial hardening tweaks (SEC-5, B-4)

- [api/src/proxy.ts:54](../../api/src/proxy.ts#L54) — constant-time API key compare:
  `crypto.timingSafeEqual` needs Node runtime; `proxy.ts` runs on Edge, so use a simple double-HMAC or length-safe manual compare, or just accept and document (the key is an optional extra gate). Simplest safe option in Edge: compare SHA-256 digests via `crypto.subtle.digest`.
- [api/src/app/api/auth/login/route.ts:35](../../api/src/app/api/auth/login/route.ts#L35) — replace `await request.json()` with `await readJsonObject(request, 4096)` (same helper the other public POSTs use).
- [api/ecosystem.config.cjs:20](../../api/ecosystem.config.cjs#L20) — `max_memory_restart: "1G"` (on a 4 GB VPS).

**Verify:** existing test suite still green (`npm test`, `npm run test:integration`).

---

## Phase 1 — Operations safety net (1–1.5 days)

Nothing here touches app code. This phase removes the existential risk.

### 1.1 Backups + rehearsed restore (O-1)

**Decide the plan tier first:** Supabase Pro ($25/mo) for daily backups; add PITR only if you want <24 h RPO.

**Nightly off-site dump** — new file `deploy/backup.sh`:

```bash
#!/usr/bin/env bash
# Nightly Postgres dump → off-site (Backblaze B2 via rclone). Keep 30 days.
set -euo pipefail
source /var/www/alassema/api/.env   # DATABASE_URL (session pooler URL works with pg_dump)
STAMP=$(date +%F)
DEST="b2:alassema-backups/db"
pg_dump "$DATABASE_URL" --no-owner --format=custom \
  | gzip > "/tmp/alassema-$STAMP.dump.gz"
rclone copy "/tmp/alassema-$STAMP.dump.gz" "$DEST/"
rm "/tmp/alassema-$STAMP.dump.gz"
rclone delete "$DEST/" --min-age 30d
```

Setup once: `apt install postgresql-client rclone`, `rclone config` (Backblaze B2 or any S3 bucket — pick a **different provider/account than Supabase**), then:

```
crontab -e
0 3 * * * /var/www/alassema/deploy/backup.sh >> /var/log/alassema-backup.log 2>&1
```

**Storage buckets:** Supabase Storage is S3-compatible (Settings → Storage → S3 access keys). Add to the same script:

```bash
rclone sync supabase-s3:logos b2:alassema-backups/storage/logos   # × 4 buckets
```

**Restore rehearsal (the part everyone skips — do not skip):**
1. Create a throwaway Supabase project.
2. `pg_restore --no-owner -d "$SCRATCH_DATABASE_URL" alassema-<date>.dump.gz` (gunzip first).
3. Point a local `api/` at it, log in, confirm companies/leads render.
4. Write the exact commands you ran into `deploy/RESTORE.md` with the time it took. That document *is* the deliverable.

**Verify:** a dump file exists in B2 tomorrow morning; `RESTORE.md` exists and was executed once.

### 1.2 Monitoring + alerting (O-2)

1. **Uptime:** BetterStack or UptimeRobot (free) → HTTP monitor on `https://<domain>/api/ready`, 1–5 min interval, alert to email + phone push. `/api/ready` already returns 503 when the DB is down — you get DB alerts for free.
2. **Errors:** create a Sentry project (free tier), set `SENTRY_DSN` in `api/.env`, restart. The reporter is already wired ([report.ts](../../api/src/lib/observability/report.ts)) — every unhandled 500 ships automatically. Send one test error to confirm.
3. **Logs:** `pm2 install pm2-logrotate` + `pm2 set pm2-logrotate:max_size 50M` + `pm2 set pm2-logrotate:retain 14`.
4. **Disk guard (2 min):** cron `df -h / | awk 'NR==2 {gsub("%","",$5); if ($5 > 85) print "disk", $5"%"}'` piped to a webhook, or just let BetterStack's server agent do it.

**Verify:** kill the DB connection (pause the Supabase project for a minute on a test window) → you receive an alert.

---

## Phase 2 — Product correctness (1–1.5 days) → **launch-ready after this phase**

### 2.1 Make notifications survive the response (SEC-4 / B-1)

Next 16 ships `after()` (stable) — it runs work after the response streams, and on serverless it keeps the function alive; on the VPS it's equivalent to what you have. This makes **both** deploy targets in DEPLOY.md safe, so you don't have to delete either.

**File:** [api/src/lib/services/leads.service.ts](../../api/src/lib/services/leads.service.ts) — in `create()`, replace the four `void …` dispatches (lines ~117–147) with:

```ts
import { after } from "next/server";

after(async () => {
  await Promise.allSettled([
    notifyNewLead(serialized, { email: company.email, whatsapp: company.whatsapp, companyName: company.name }),
    prisma.user
      .findMany({ where: { role: "ADMIN", isActive: true }, select: { email: true } })
      .then((admins) => notifyAdmins(serialized, company.name, admins.map((a) => a.email))),
    pushCompanyProviders(company.id, { /* unchanged payload */ }),
    pushAdmins({ /* unchanged payload */ }),
  ]);
});
```

Apply the same wrap to the other fire-and-forget sites:
- [reviews.service.ts:316](../../api/src/lib/services/reviews.service.ts#L316) (`notifyAdminsNewReview`)
- [projects.service.ts](../../api/src/lib/services/projects.service.ts) (`notifyAdminsPendingProject`)

Note: `after()` must run within a request scope — all three call sites are inside route-invoked services, so they qualify. The existing unit tests for the notification builders don't change; the integration tests still pass because `after()` executes callbacks in-process in the Node runtime.

**Verify:** submit a lead locally with `RESEND_API_KEY` set to a test key → email fires; check no change to response latency (the response must return *before* the notification work).

### 2.2 Deploy the CSP (SEC-1, part 1)

The policy is already drafted in [DEPLOY.md §7](../deployment/DEPLOY.md). Roll it out in report-only first.

**VPS path (Caddy serves the SPA)** — add to the `handle` block in [deploy/Caddyfile](../../deploy/Caddyfile):

```caddy
handle {
    root * /var/www/alassema/dist
    header Content-Security-Policy-Report-Only "default-src 'self'; script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https://<SUPABASE-REF>.supabase.co; connect-src 'self'; frame-src https://challenges.cloudflare.com; frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'"
    try_files {path} /index.html
    file_server
}
```

(Substitute `<SUPABASE-REF>`; drop the Turnstile entries if CAPTCHA stays off. `connect-src 'self'` is enough because the API is same-origin behind Caddy.)

Rollout:
1. Ship report-only; browse every page (home, category, company, request form, admin, provider) with DevTools console open; fix any violation.
2. After 2–3 quiet days, rename the header to `Content-Security-Policy`.
3. Optional tightening later: move the inline locale-init script in `app/index.html` to an external file and delete `'unsafe-inline'` from `script-src` — that's the change that gives CSP real teeth against XSS.

**Verify:** `curl -sI https://<domain>/ | grep -i content-security` shows the header; an injected inline `<script>` in DevTools is blocked once enforcing.

### 2.3 Launch gate checklist

Before flipping DNS/announcing, confirm in one sitting:

- [ ] `deploy/RESTORE.md` exists and was executed once (1.1)
- [ ] Uptime alert fired in a test (1.2)
- [ ] Sentry received a test event (1.2)
- [ ] Seed guard aborts against prod DB (0.1)
- [ ] `DATABASE_SSL_CA_PATH` set on the server (0.3)
- [ ] Lead submit → provider email + admin email + push all arrive (2.1)
- [ ] CSP header present, report-only clean (2.2)
- [ ] `JWT_TTL=1d` (or shorter), `JWT_SECRET` ≥32 chars, `CORS_ALLOWED_ORIGINS` set (or same-origin), `RATE_LIMIT_ALLOW_INMEMORY=1` documented as deliberate for the single VPS

---

## Phase 3 — First two weeks after launch (2–3 days total, interleave with real work)

### 3.1 Integration tests on the security ingress (T-1)

Add to [api/tests/integration/api.int.test.ts](../../api/tests/integration/api.int.test.ts) (or a new `auth.int.test.ts`):

- **Login:** correct creds → 200 + token; wrong password ×11 from different IPs (pass distinct `x-forwarded-for` via the existing `req()` helper) → 11th returns 429 with the *account* limiter message; correct password still succeeds afterwards (failure-only invariant); inactive user → 401 generic.
- **proxy.ts:** unit-test `resolveAllowedOrigin` and the API-key gate as pure functions of (request, env) — assert production + empty allowlist ⇒ deny, probe paths bypass the key gate.
- **Upload route:** one multipart request with a 1×1 PNG fixture through `adminOnly` → 200 `{url}` (mock `getSupabaseAdmin`), and a `.txt` file → 400.

### 3.2 Abuse rehearsal (T-2)

A 40-line k6 script in `deploy/loadtest/`: 50 rps of `POST /api/leads` from rotating fake XFF headers for 2 minutes against **staging**. Assert: site-wide breaker trips (429s), `/api/ready` stays 200, no 500s in Sentry, and legit requests from an untouched IP still pass. This validates the entire rate-limit stack you built.

### 3.3 Rollback-capable deploys (O-3)

Restructure the server layout to release directories; change [deploy/deploy.sh](../../deploy/deploy.sh):

```
/var/www/alassema/
  releases/2026-07-10-a1b2c3/   (full checkout, built)
  current -> releases/2026-07-10-a1b2c3
```

- Deploy = clone/fetch into a new `releases/<date>-<sha>` dir, build there, run `prisma migrate deploy`, then `ln -sfn` the symlink + `pm2 reload` (PM2 `cwd` points at `current`).
- Rollback = `ln -sfn releases/<previous> current && pm2 reload alassema-api` — seconds, no rebuild. Keep the last 5 releases.
- Caveat to document: migrations are forward-only; a rollback after a destructive migration still needs the Phase-1 backup. (Another reason the migrations in this repo being additive-only is worth keeping as a rule.)

### 3.4 Structured logging (Q-3)

Add `pino`; create `lib/log.ts`; generate a request id in `withErrors` and include it in the 500 body (`message: "Something went wrong (ref: abc123)"`) and in every log line. Replace `console.*` in services/middleware mechanically. Half a day; transforms incident debugging.

---

## Phase 4 — First 4–6 weeks (3–5 days total)

### 4.1 Retire the localStorage token (SEC-1, part 2) — the one real architecture change

Target: `httpOnly; Secure; SameSite=Strict` cookie, same-origin (the Caddy deploy already serves app + API on one origin, which is what makes this cheap).

1. **Login route:** also `Set-Cookie: session=<jwt>; HttpOnly; Secure; SameSite=Strict; Path=/api; Max-Age=<ttl>`; keep returning the body token temporarily (transition period).
2. **`bearerToken()` in [auth.ts](../../api/src/lib/auth.ts):** fall back to the cookie when the Authorization header is absent.
3. **CSRF:** with `SameSite=Strict` + JSON-only bodies + the existing CORS deny-by-default, risk is already minimal; belt-and-braces = require the existing `X-Api-Key`-style custom header (`X-Requested-With: fetch`) on cookie-authed mutations — any custom header forces a CORS preflight, which cross-origin attackers can't pass.
4. **Frontend:** switch `credentials: "include"`, delete the localStorage read/write, keep an `/api/auth/me` bootstrap on load.
5. **Logout:** clear the cookie server-side — this also gives you real logout for the first time.
6. After the frontend is deployed everywhere, stop returning the token in the login body.

Effort: 2–3 days including the frontend. Payoff: XSS no longer yields a copyable admin credential, and sessions become server-revocable at the cookie layer.

### 4.2 HTTP caching on public reads (P-1)

In the public GET routes (categories, companies list, company detail, settings, featured projects), return with:

```ts
return ok(data, 200, { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" });
```

(extend `ok()` to accept headers), and let Caddy (or later a CDN) honor it. Admin/provider/lead endpoints stay `no-store`. One day including cache-busting thought (60 s staleness on catalog edits is acceptable; if not, drop to 15 s).

### 4.3 Shared contract package (A-2)

Move `apiTypes.ts` to `packages/contract/` (npm workspace), import from both `api/` and `app/`. Keep the snapshot test as a tripwire. Half a day of import churn, permanent drift elimination.

### 4.4 Ops hygiene leftovers

- `deploy/SERVER-SETUP.md` runbook (Node version, Caddy, PM2, cron entries, env files) — or a Dockerfile if you prefer (O-4).
- Sentry alert rule: >5 errors/10 min → notify.

---

## Phase 5 — When scale demands (no calendar date; triggered by metrics)

| Trigger | Action | Ref |
| --- | --- | --- |
| Move to 2+ app instances or any serverless | Set Upstash `UPSTASH_REDIS_REST_URL/TOKEN`, remove `RATE_LIMIT_ALLOW_INMEMORY`; batch the 3 lead-submit limit checks into one pipeline call | B-3, P-3 |
| Admin search feels slow (~50–100k leads) | `pg_trgm` + GIN indexes on searched columns | DB-1 |
| Provider/review queries heavy in `pg_stat_statements` | Composite indexes `(companyId, approved, createdAt)` / `(companyId, status, createdAt)` | DB-2 |
| Admin company list slow | Card serializer for `listAll` | P-2 |
| Notification volume grows / adding digests | pg-boss queue in Postgres (no new infra) | §10 |
| Multi-tenant / white-label-as-platform decision | Tenant column discipline on all new tables **starting now**; full design before building | §13 |

---

## Phase summary

| Phase | Duration | Contents | Exit state |
| --- | --- | --- | --- |
| **0 — Code guards** | 0.5 day | Seed guard, JWT secret check, DB CA pinning, login body cap, API-key compare, PM2 memory | Foot-guns removed |
| **1 — Ops safety net** | 1–1.5 days | Backups + rehearsed restore + runbook, uptime alerts, Sentry, log rotation | Failure is detectable and recoverable |
| **2 — Product correctness** | 1–1.5 days | `after()` notifications, CSP report-only → enforce, launch checklist | **Launch-ready** |
| **3 — Weeks 1–2 post-launch** | 2–3 days | Ingress integration tests, k6 abuse rehearsal, rollback deploys, pino logging | Safe to iterate quickly |
| **4 — Weeks 3–6** | 3–5 days | httpOnly-cookie auth, HTTP caching, shared contract package, server runbook | Audit's High/Medium items retired |
| **5 — Metric-triggered** | as needed | Redis limiter, indexes, trigram search, queue, tenancy decision | Scales without rewrites |
