# SECURITY AUDIT REPORT — Al Assema (العاصمة)

| | |
|---|---|
| **Scope** | Entire monorepo: `api/` (Next.js 16.2.9 + Prisma 7 + Postgres/Supabase), `app/` (Vite 5 + React 18 SPA), `deploy/`, `.github/`, `scripts/`, `docs/`, `_backups/` |
| **Audit date** | 2026-08-10 |
| **Method** | Static source review, configuration analysis, dependency/lockfile analysis, git-index inspection, read-only live-database introspection (Supabase MCP: advisors, catalog, `pg_proc`, `storage.buckets`), archive content inspection |
| **Authorization** | Owner-requested audit of their own application |
| **Destructive testing** | None. No writes, no deletes, no DoS, no brute force, no third-party exploitation |
| **Overall Security Risk** | **CRITICAL** — driven by one confirmed secret-exposure finding. Application-layer code quality is well above average |

> **Secrets policy for this document:** no secret value appears anywhere below. Where it is operationally useful to let you verify rotation, a **truncated SHA-256 fingerprint** (first 10 hex characters) is given. A fingerprint is not reversible and is not a credential.

---

# 1. Executive Summary

## Overall risk: CRITICAL — immediate action required

The application code is, frankly, some of the better-defended code I have reviewed. Authorization is derived from the server-side session on every route, ownership is checked in the service layer rather than the UI, prices are resolved server-side, timing side-channels in login are closed, the page-index overflow and NUL-byte crash classes are already fixed, and the one-time-review flow uses a proper conditional claim inside a transaction. Across 101 route handlers I found **no missing authentication, no missing role gate, and no IDOR**.

The critical risk is not in the code. It is that **the production `.env` file — with every live secret in it — is committed to the git repository** inside a backup archive, and **none of those secrets have been rotated**.

## The most serious issue

`_backups/al-assema-backup-20260720-191534.tar.gz` (14.9 MB) is tracked by git and pushed to the remote. It contains `./api/.env`. I verified by SHA-256 fingerprint that **seven live secrets in that archived file are byte-identical to the ones the application uses today**, including the JWT signing secret, the Supabase service-role key, the Telegram bot token and webhook secret, the VAPID private key, and the production database URL with its password.

Anyone who can read the repository can:

* mint a valid `ADMIN` session token for any user id (JWT_SECRET) — complete authentication and authorization bypass, no password needed;
* connect directly to the production database with full read/write (DATABASE_URL);
* read, overwrite and delete every uploaded file (Supabase service-role key);
* take over the Telegram notification bot and forge webhook calls;
* forge push notifications to every subscribed admin and provider device.

This is a full compromise of confidentiality, integrity and authentication. **Rotate everything before doing anything else on this list.**

## The most exposed attack surfaces

1. **The git repository itself** — it is the vulnerability. `scripts/ship.sh` runs `git add -A` and `_backups/` is not in any `.gitignore`, so this will happen again.
2. **An abandoned Supabase project** (`vdwurkqarfnrquwihweo`) that is still `ACTIVE_HEALTHY`, still holds 9 real user accounts with bcrypt hashes, 63 audit-log rows and 440 storage objects, and whose service-role key is the leaked one. Its last migration was applied 2026-07-20 — the day of the data-loss incident — and the repo is 16 migrations ahead of it.
3. **The public frontend origin**, which ships no enforced security headers at all — the CSP has been in `Report-Only` mode since it was written.
4. **The authenticated provider role.** Providers are third-party companies, not staff. They are correctly fenced off from each other's data, but they can submit unvalidated field values through the change-request queue, upload 50 MB videos without any rate limit, and cause the server to issue HTTP requests to arbitrary URLs via push subscriptions.

## Is immediate action required?

Yes, for one thing only: **credential rotation (P0)**. Everything else is a normal remediation backlog.

---

# 2. Security Score

**Score: 41 / 100 — Overall Security Risk: CRITICAL**

## Methodology

Start at 100. Deduct per confirmed finding by severity, then apply domain modifiers for coverage and control maturity.

| Component | Deduction | Notes |
|---|---|---|
| Critical findings (1 × −40) | −40 | Live unrotated secrets in version control |
| High findings (3 × −7) | −21 | Abandoned data store, repo hygiene process, missing frontend headers |
| Medium findings (8 × −2.5) | −20 | SSRF, validation gap, body limits, rate limiting, logging, password policy, CSP not enforced, bot controls off |
| Low + informational (14 × −0.5) | −7 | Hardening backlog |
| **Subtotal** | **12** | |
| **Credit: application-layer controls** | **+29** | See below |
| **Final** | **41** | |

### Credit applied (+29)

Awarded because these are verified-present, not assumed:

* Authentication & authorization architecture (+8) — zero missing guards across 101 routes; identity and `companyId` always derived server-side from the session, never from the request body.
* Injection resistance (+5) — Prisma ORM throughout; both `$queryRaw` uses are parameterized tagged templates; no `eval`, no `child_process` in server code, no dynamic SQL.
* XSS posture (+5) — zero `dangerouslySetInnerHTML`, a hand-written Markdown renderer that emits React elements, server-side `stripHtml` on every free-text write, HTML-escaped email templates.
* Input validation (+4) — Zod on essentially every write path, with length and array caps.
* Abuse controls on public endpoints (+4) — per-IP + site-wide + per-company rate limits, honeypot, bounded body reads, CAPTCHA hooks, per-account login failure throttling.
* Data-exposure discipline (+3) — separate public/admin serializers; `email`, `whatsapp`, `telegramChatId`, `telegramLinkToken` and `passwordHash` never reach a public payload.

### Domain sub-scores

| Domain | Score | Rating |
|---|---|---|
| Authentication | 78 / 100 | Good (weak password policy, no self-service change, no login logging) |
| Authorization | 92 / 100 | Strong |
| API security | 74 / 100 | Good (body limits and rate limits stop at the auth boundary) |
| Input validation & injection | 88 / 100 | Strong (one gap: change-request values) |
| Database & RLS | 70 / 100 | Adequate (RLS on, deny-all; abandoned project drags this down) |
| Frontend / client-side | 72 / 100 | Good code, no enforced headers |
| Infrastructure & headers | 55 / 100 | Weak (CSP report-only, no headers on the SPA origin) |
| **Secrets management** | **5 / 100** | **Failing** |
| Supply chain | 80 / 100 | Good (one dev-only moderate CVE) |
| Logging & monitoring | 55 / 100 | Partial (admin CRUD audited; auth events are not) |

---

# 3. Finding Summary

| ID | Severity | Confidence | Category | Location | Status |
|---|---|---|---|---|---|
| C-01 | CRITICAL | CONFIRMED | Secrets in VCS | `_backups/al-assema-backup-20260720-191534.tar.gz` → `./api/.env` | Open |
| H-01 | HIGH | CONFIRMED | Dangling service / data retention | Supabase project `vdwurkqarfnrquwihweo` | Open |
| H-02 | HIGH | CONFIRMED | Process / repo hygiene | `scripts/ship.sh:28`, `.gitignore`, `deploy/backup.sh:42` | Open |
| H-03 | HIGH | HIGH CONFIDENCE | Security misconfiguration | `deploy/Caddyfile:42-68` | Open |
| M-01 | MEDIUM | CONFIRMED | CSP not enforced | `deploy/Caddyfile:64`, `app/vercel.json` | Open |
| M-02 | MEDIUM | CONFIRMED | SSRF (authenticated, blind) | `api/src/lib/validation/push.ts:6`, `push.service.ts:69` | Open |
| M-03 | MEDIUM | CONFIRMED | Input validation bypass | `api/src/lib/validation/changeRequests.ts:23` | Open |
| M-04 | MEDIUM | CONFIRMED | Unrestricted resource consumption | ~50 authenticated route files (`await request.json()`) | Open |
| M-05 | MEDIUM | CONFIRMED | Missing rate limiting | All `adminOnly` / `providerOnly` routes; upload routes | Open |
| M-06 | MEDIUM | CONFIRMED | Insufficient logging | `api/src/app/api/auth/login/route.ts` | Open |
| M-07 | MEDIUM | CONFIRMED | Weak credential policy | `api/src/lib/validation/users.ts:7` | Open |
| M-08 | MEDIUM | HIGH CONFIDENCE | Abuse controls disabled | `api/.env` (CAPTCHA + Redis unset) | Open |
| L-01 | LOW | CONFIRMED | Weak randomness | `api/src/lib/utils/refNumber.ts:9` | Open |
| L-02 | LOW | CONFIRMED | Weak legacy credential | `api/src/lib/services/leads.service.ts:330` | Open |
| L-03 | LOW | CONFIRMED | Permissive URL validation | `api/src/lib/validation/shared.ts:7` | Open |
| L-04 | LOW | CONFIRMED | Unnecessary token exposure | `api/src/app/api/auth/login/route.ts:67` | Open |
| L-05 | LOW | CONFIRMED | Subscription hijack | `api/src/app/api/push/subscribe/route.ts:21` | Open |
| L-06 | LOW | CONFIRMED | Fail-open control | `api/src/lib/middleware/captcha.ts:65` | Accepted by design |
| L-07 | LOW | CONFIRMED | Nested repository | `app/.git/` | Open |
| L-08 | LOW | CONFIRMED | No storage lifecycle | `api/src/lib/services/upload.service.ts`, buckets | Open |
| L-09 | LOW | CONFIRMED | Excessive DB privilege | `public.rls_auto_enable()` EXECUTE grant | Open |
| L-10 | LOW | CONFIRMED | Supply chain | `esbuild@0.21.5` via `vite@5.4.21` | Open |
| I-01 | INFO | CONFIRMED | Stale security doc | `api/SECURITY.md` | Open |
| I-02 | INFO | CONFIRMED | Placeholder in config | `app/vercel.json` CSP `connect-src` | Open |
| I-03 | INFO | CONFIRMED | Internal id exposure | `api/src/lib/utils/serialize.ts:284` | Accepted |
| I-04 | INFO | CONFIRMED | Supabase Auth setting | Leaked-password protection disabled | Not applicable |

**Totals:** 1 Critical · 3 High · 8 Medium · 10 Low · 4 Informational

---

# 4. Critical Findings

## C-01 — Live production secrets committed to the git repository, unrotated

**Severity:** CRITICAL · **Confidence:** CONFIRMED

### Vulnerability

A 14.9 MB backup archive containing a full copy of the production environment file is tracked by git and has been pushed to the remote. Every secret inside it is still the secret the application uses today.

### Location

* Tracked file: `_backups/al-assema-backup-20260720-191534.tar.gz`
* Archive members carrying secrets: `./api/.env`, `./app/.env.local`
* Confirmed present in `.git/index` (the file is staged/tracked, not merely on disk)

### Evidence

Archive membership (`tar -tzf`, read-only listing):

```
./api/.env
./api/.env.example
./api/.env.test.example
./app/.env.example
./app/.env.local
./deploy/backup.sh
```

Git-index confirmation (paths extracted from `.git/index`):

```
_backups/al-assema-backup-20260720-191534.tar.gz   → TRACKED
api/.env                                           → not tracked (correctly ignored)
api/.env.production.reference                      → not tracked (correctly ignored)
```

The individual `.env` files are correctly gitignored. They were nonetheless committed **inside the archive**, which the ignore rules do not cover.

Secret fingerprint comparison — archived value vs. the value in use today (SHA-256, first 10 hex characters; **not** the secret):

| Secret | Archived | Current | Verdict |
|---|---|---|---|
| `JWT_SECRET` | `CD2045F013` | `CD2045F013` | **IDENTICAL — still live** |
| `SUPABASE_SERVICE_ROLE_KEY` | `11F25BD6D4` | `11F25BD6D4` | **IDENTICAL — still live** |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `B853CF38A9` | `B853CF38A9` | **IDENTICAL — still live** |
| `TELEGRAM_BOT_TOKEN` | `521E39FDAA` | `521E39FDAA` | **IDENTICAL — still live** |
| `TELEGRAM_WEBHOOK_SECRET` | `19CC5C2DBD` | `19CC5C2DBD` | **IDENTICAL — still live** |
| `VAPID_PRIVATE_KEY` | `99796EFADB` | `99796EFADB` | **IDENTICAL — still live** |
| `DATABASE_URL` (production) | `5067E2A0F7` | `5067E2A0F7` | **IDENTICAL** to `api/.env.production.reference` |

The archived `DATABASE_URL` is the production Supabase session-pooler URL **including the database password**, matching `api/.env.production.reference` exactly.

### Root cause

Two mechanisms combined:

1. `scripts/ship.sh:28` runs `git add -A`, which stages everything not ignored, with no review step and no secret scanning.
2. Neither the root `.gitignore` nor any nested one excludes `_backups/`. The ignore rules were written to catch `.env` **as a path**, so a `.env` nested inside a tarball is invisible to them.

The archive was created on 2026-07-20 at 19:15 — during the incident response for that day's production data loss — and shipped along with everything else on the next `npm run ship`.

### Attack scenario

An attacker with read access to the repository (a public repo, a former collaborator, a leaked CI token, a forked clone, a compromised laptop with the 79 MB `.git` directory, or any GitHub-wide secret-scanning bot) extracts `api/.env` from the archive and then:

1. Signs a JWT with `{ "sub": "<any user id>", "role": "ADMIN", "companyId": null }` using the leaked `JWT_SECRET` and HS256. `getAuthUser` verifies the signature, loads the user, and grants full admin. Every one of the 47 admin routes is now open. No password, no rate limit, no audit trail of a login because logins are not logged (see M-06).
2. Connects to Postgres directly with the leaked `DATABASE_URL`, bypassing the application entirely — reads every lead, phone number, customer message and password hash; or writes/destroys at will.
3. Uses the Supabase service-role key against Storage to overwrite, delete or plant files in the four public buckets (whose contents are served to every visitor).
4. Calls the Telegram Bot API with the bot token to read the bot's message history and impersonate platform notifications to linked providers; and forges webhook calls using the webhook secret.
5. Signs VAPID push messages to every subscribed admin and provider device.

### Impact

| Dimension | Impact |
|---|---|
| Confidentiality | **Total.** All customer PII (names, phones, districts, budgets, private chat threads), all provider data, all password hashes |
| Integrity | **Total.** Direct DB write, storage write, forged admin sessions |
| Availability | High — direct DB access permits destructive operations |
| Authentication | **Completely bypassed** — forged tokens require no credentials |
| Authorization | **Completely bypassed** — the forged role claim is trusted after signature verification |
| Privacy | Severe — this is regulated personal data of real customers |
| Business logic | Every server-side guard is irrelevant to an attacker holding the signing key |

### Exploitability

**Trivial.** No vulnerability research required. Extracting a `.env` from a tarball and signing a JWT are both one-liners. The only prerequisite is repository read access.

### Recommendation

Rotate first, clean second. Cleaning history without rotating is worthless — the archive already exists in every clone and every fork.

**Step 1 — rotate every secret (do this today, in this order):**

| Secret | How |
|---|---|
| `JWT_SECRET` | `openssl rand -base64 48`. Rotating invalidates every live session — expected and desirable |
| Supabase database password | Supabase Dashboard → Settings → Database → Reset password; update `DATABASE_URL`/`DIRECT_URL` in the server's `api/.env` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard → API Keys → roll the secret key |
| Supabase anon/publishable key | Roll alongside the service key |
| `TELEGRAM_BOT_TOKEN` | @BotFather → `/revoke` → new token; then re-register the webhook |
| `TELEGRAM_WEBHOOK_SECRET` | New random string; re-run `setWebhook` with it |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | `npx web-push generate-vapid-keys`. **This invalidates every existing push subscription** — users must re-enable notifications. Plan the comms |
| All admin/provider passwords | Force a reset; assume the database was readable |

**Step 2 — remove the archive from history:**

```bash
git rm --cached _backups/al-assema-backup-20260720-191534.tar.gz
echo "_backups/" >> .gitignore
git commit -m "chore: stop tracking local backup archives"
# then purge from history (coordinate — this rewrites SHAs):
#   git filter-repo --path _backups/ --invert-paths
# and force-push, then have every collaborator re-clone.
```

**Step 3 — prevent recurrence:** see H-02.

**Step 4 — assume breach.** Review the Supabase logs and the `AuditLog` table for activity you cannot account for since 2026-07-20.

---

# 5. High Findings

## H-01 — Abandoned Supabase project still holds production PII and password hashes

**Severity:** HIGH · **Confidence:** CONFIRMED (read-only introspection of the live project)

### Vulnerability

Supabase project `vdwurkqarfnrquwihweo` is still `ACTIVE_HEALTHY` and still holds real production data, but it is no longer the database the application runs migrations against. It was never decommissioned or wiped, and its service-role key is one of the keys leaked in C-01.

### Location

Supabase project `vdwurkqarfnrquwihweo` (region `eu-west-1`, Postgres 17.6). Referenced by `api/.env.production.reference` and `NEXT_PUBLIC_SUPABASE_URL`.

### Evidence

`_prisma_migrations` — last applied migration and its timestamp:

```
20260719120000_company_availability_waitlist   finished_at 2026-07-20 15:59:25+00
```

17 migrations applied. The repository contains **33**. Everything from `20260727211859_add_change_requests` onward (change requests, offerings, tiers, bundle rules, lead items, busy windows, chat, category pricing mode, company↔category many-to-many) is absent.

Row counts still present in that project:

```
public.User               9 rows   (includes bcrypt passwordHash)
public.AuditLog          63 rows
public.Review            12 rows
public.Project           12 rows
public.Company            4 rows
public.SiteReview         9 rows
public.AppSetting        22 rows
public.PushSubscription   2 rows
storage.objects         440 rows
```

The last migration timestamp is the same day as the destructive-seed incident recorded in `CLAUDE.md`.

### Root cause

The database was migrated away (per `_backups/PROMPT-migrate-db-to-server.md`) but the old project was left running with its data in place, and its keys were left in the active `api/.env`. Storage is apparently still served from it — `deploy/Caddyfile`'s CSP allows `img-src`/`media-src https://*.supabase.co`, and 440 objects live there.

### Attack scenario

An attacker holding the leaked service-role key (C-01) connects to this project's REST and Storage APIs. Even though PostgREST is correctly locked down for `anon` (see §12), the service-role key bypasses RLS entirely. They retrieve nine real user accounts with bcrypt hashes and 63 audit records, and can modify or delete the 440 live storage objects that the production site serves to visitors.

### Impact

Confidentiality (historical PII and password hashes), Integrity (storage objects still served in production), Privacy. Independently of C-01, it is an unmonitored, unpatched, credentialed system holding personal data with no business purpose.

### Exploitability

Trivial given C-01's leaked key; otherwise requires obtaining a key.

### Recommendation

1. Decide explicitly whether this project is still the Storage backend. If it is, that is a *live* dependency and must be treated as production, not abandoned.
2. If the database side is genuinely retired: export anything you need for compliance, then **drop the `public` schema tables** or delete the project.
3. Rotate its keys regardless (C-01 step 1).
4. If Storage stays, plan the migration to `STORAGE_DRIVER=local` (already implemented in `upload.service.ts:194`) so the VPS backup covers images, and then retire the project fully.

---

## H-02 — The publishing process actively creates secret leaks

**Severity:** HIGH · **Confidence:** CONFIRMED

### Vulnerability

`npm run ship` stages everything and pushes it, and the directories most likely to contain secrets are not excluded. C-01 is the outcome, not the cause; without this fix it recurs.

### Location

* `scripts/ship.sh:28` — `git add -A`
* Root `.gitignore` — no `_backups/`, no `backups/`, no `deliverables/`
* `deploy/backup.sh:42` — `LOCAL_BACKUP_DIR=/var/www/alassema/backups`

### Evidence

`scripts/ship.sh`:

```bash
git add -A

if git diff --cached --quiet; then
```

Root `.gitignore` covers `.env`, `.env.local`, `.env.*.local`, `dist/`, `node_modules/` — and explicitly comments that `deliverables/` is *not* ignored. `_backups/` is absent entirely.

`deploy/backup.sh` writes `pg_dump` output to `/var/www/alassema/backups`, which — per `deploy/deploy.sh:14` (`ROOT="$(cd "$(dirname "$0")/.." && pwd)"`) — is **inside the git working tree on the server**. Nightly full database dumps therefore sit in an untracked-but-not-ignored directory in a git repo.

### Attack scenario

Any future `git add -A` (from `ship.sh` run on the server, or by anyone debugging there) commits and pushes complete production database dumps — every customer's name, phone number, district, budget, description and private chat history.

### Impact

Confidentiality, Privacy — with the potential to be far larger than C-01, since a dump is the whole dataset rather than the keys to it.

### Recommendation

1. Add to root `.gitignore`:
   ```
   _backups/
   backups/
   *.tar.gz
   *.dump
   *.sql
   ```
2. Move `LOCAL_BACKUP_DIR` outside the repo — e.g. `/var/backups/alassema`.
3. Add a pre-commit secret scan (`gitleaks protect --staged`, or `trufflehog git file://. --since-commit HEAD`) and have `ship.sh` fail closed on a hit.
4. Replace bare `git add -A` with a version that prints the staged file list and refuses when a staged file exceeds a size threshold (say 1 MB) without `--force`.
5. Enable GitHub push protection / secret scanning on the remote.

---

## H-03 — No enforced security headers on the frontend origin

**Severity:** HIGH · **Confidence:** HIGH CONFIDENCE (verify against the live host)

### Vulnerability

`next.config.ts` defines a good header set, but Next.js only serves `/api/*` here. Everything a browser actually loads — the HTML document, the JS bundle, the service worker, the session cookie's origin — is served by Caddy's `handle` block, which sets exactly one header, and that one is report-only.

### Location

`deploy/Caddyfile:42-68`

### Evidence

```caddy
handle {
    root * /var/www/alassema/dist

    header Content-Security-Policy-Report-Only "default-src 'self'; …"

    try_files {path} /index.html
    file_server
}
```

There is no `Strict-Transport-Security`, no `X-Content-Type-Options`, no `X-Frame-Options`, no `Referrer-Policy`, no `Permissions-Policy` — and the CSP is `Report-Only`.

By contrast `next.config.ts:7-13` sets all five for API responses, and `app/vercel.json` sets all five for the (unused) Vercel deployment path. The VPS deployment — the one that is live — is the gap.

Caddy v2 does not add HSTS automatically; it only performs the HTTP→HTTPS redirect.

### Attack scenario

* **No HSTS:** a first visit over `http://`, or an attacker on a shared/hostile network, can be held on plaintext by an SSL-stripping proxy. The session cookie is `Secure` in production and so will not be sent — but the login form itself can be served modified over plaintext and the password harvested.
* **No `X-Content-Type-Options: nosniff`:** an uploaded file served with a wrong or generic type can be sniffed into an executable type by the browser.
* **No `X-Frame-Options` / enforced `frame-ancestors`:** the admin and provider dashboards can be framed by a hostile page for clickjacking (`frame-ancestors 'none'` is present in the CSP but report-only, so it is not enforced).
* **No `Referrer-Policy`:** full URLs — including the customer tracking page's `?ref=`/`?token=` query parameters — leak in the `Referer` header to any external resource the page loads.

That last one is the sharpest here: `/api/leads/track?ref=…&token=…` uses the tracking token as a URL parameter, and the API sets `Referrer-Policy: no-referrer`, but the *frontend page* the customer lands on does not.

### Impact

Authentication (credential capture via stripping), Confidentiality (referrer leakage of lead tracking tokens), Integrity (clickjacking on dashboards).

### Recommendation

Add to the Caddy `handle` block:

```caddy
header {
    Strict-Transport-Security "max-age=63072000; includeSubDomains; preload"
    X-Content-Type-Options    "nosniff"
    X-Frame-Options           "DENY"
    Referrer-Policy           "no-referrer"
    Permissions-Policy        "camera=(), microphone=(), geolocation=()"
    Cross-Origin-Opener-Policy "same-origin"
    Cross-Origin-Resource-Policy "same-origin"
    -Server
}
```

Then verify with `curl -I https://<your-domain>/`. Only add `preload` once you are certain about every subdomain — it is hard to undo.

---

# 6. Medium Findings

## M-01 — Content-Security-Policy has never been enforced

**Severity:** MEDIUM · **Confidence:** CONFIRMED

**Location:** `deploy/Caddyfile:64`, `app/vercel.json`

**Evidence:** both ship `Content-Security-Policy-Report-Only`. `docs/deployment/DEPLOY.md:198` still lists "rename `Content-Security-Policy-Report-Only` to `Content-Security-Policy`" as an outstanding to-do. The Caddyfile comment says "TO ENFORCE (after a few quiet days)"; those days have passed.

**Root cause:** a deliberate staged rollout that was never completed.

**Attack scenario:** report-only blocks nothing. Any future XSS — a dependency compromise, a `dangerouslySetInnerHTML` added in a hurry, an injected third-party script — executes with no restraint. The policy itself is well constructed (`script-src 'self'` with no `'unsafe-inline'`, made possible by moving locale init to an external `/locale-init.js`), which makes leaving it unenforced the more frustrating.

**Impact:** removes the defence-in-depth layer for the entire XSS class. Note the *current* XSS risk is genuinely low (see §14) — this is about the next change, not this one.

**Recommendation:** check the browser console for violations on home, category, company, request-form, admin and provider pages, fix any, then drop `-Report-Only` in `deploy/Caddyfile`. Consider adding a `report-uri`/`report-to` endpoint first so you get telemetry rather than relying on someone having DevTools open.

---

## M-02 — Authenticated blind SSRF via push subscription endpoints

**Severity:** MEDIUM · **Confidence:** CONFIRMED

**Location:** `api/src/lib/validation/push.ts:6`; consumed at `api/src/lib/services/push.service.ts:69`; entry point `api/src/app/api/push/subscribe/route.ts:21`

**Vulnerability:** the `endpoint` a client supplies is validated only as a syntactically valid URL, stored, and later used as the destination of a server-side POST. There is no allowlist of legitimate push services.

**Evidence:**

```ts
export const pushSubscribeSchema = z.object({
  endpoint: z.string().url().max(2000),
  keys: z.object({ p256dh: …, auth: … }),
});
```

```ts
const subscription: WebPushSubscription = {
  endpoint: s.endpoint,
  keys: { p256dh: s.p256dh, auth: s.auth },
};
return webpush.sendNotification(subscription, body);
```

Real push endpoints only ever live on a small set of hosts (`fcm.googleapis.com`, `*.push.services.mozilla.com`, `*.notify.windows.com`, `web.push.apple.com`). Nothing checks that.

**Root cause:** the schema models the *shape* of `PushSubscription.toJSON()` without constraining its *destination*.

**Attack scenario:** an authenticated PROVIDER — remember, providers are third-party companies, not staff — registers `endpoint: "http://127.0.0.1:3000/api/admin/stats"` or `"http://169.254.169.254/latest/meta-data/"`. On the next lead or chat message, the server issues a POST to that URL from inside the trust boundary. The response body is discarded, but `push.service.ts:79-84` branches on the status code — 404/410 silently prunes the row, anything else is logged with its code. That is enough of an oracle to port-scan and fingerprint internal services one notification at a time.

**Impact:** Confidentiality (internal network mapping, potential cloud metadata reach), Integrity (POSTs to internal endpoints). Bounded by: requires an authenticated account; the request body is a VAPID-signed encrypted blob the attacker does not control; the response is not returned.

**Recommendation:** add a host allowlist to the schema.

```ts
const PUSH_HOSTS = [
  /\.googleapis\.com$/, /\.push\.services\.mozilla\.com$/,
  /\.notify\.windows\.com$/, /^web\.push\.apple\.com$/,
];
endpoint: z.string().url().max(2000).refine((u) => {
  const url = new URL(u);
  return url.protocol === "https:" && PUSH_HOSTS.some((re) => re.test(url.hostname));
}, "Not a recognised push service endpoint")
```

Require `https:` explicitly — that alone removes the plaintext-internal-service case.

---

## M-03 — Change-request field values bypass every validation rule

**Severity:** MEDIUM · **Confidence:** CONFIRMED

**Location:** `api/src/lib/validation/changeRequests.ts:23`; applied at `api/src/lib/services/changeRequests.service.ts:674`

**Vulnerability:** the change-request system correctly allowlists *which fields* a provider may edit, but never validates *what values* they may set. Those values are written straight into `prisma[entity].update({ data })` on approval.

**Evidence:**

```ts
// Values stay `unknown` here: they are field values for an arbitrary entity, so
// per-field typing belongs to the entity's own schema.
changes: z.record(z.string(), z.unknown()).refine(
  (o) => Object.keys(o).length > 0,
  "At least one change is required",
),
```

The comment names the intended design — but no entity schema is ever applied, at submit or at approve. Compare the direct admin path, `api/src/lib/validation/companies.ts`, which for the very same columns enforces `sanitizedOptionalText(5000)` on `about`, `imageRef` on `logo`/`cover`, `.max(60)` on `gallery`, `.max(20)` on `badges`, and `z.number().int().min(0).max(200)` on `yearsExperience`.

`EDITABLE_FIELDS.COMPANY` includes `name`, `tagline`, `about`, `logo`, `cover`, `gallery`, `badges` — and `serialize.ts:284-323` (`companyScalars`) returns all of them in the **public, CDN-cacheable** `/api/companies` list payload.

**Root cause:** the allowlist was built to answer "which fields", and the "which values" half was deferred and never landed.

**Attack scenario:**

1. **Type confusion → admin-queue denial of service.** A provider submits `{ "yearsExperience": "many" }` or `{ "gallery": "not-an-array" }`. The submit succeeds — nothing type-checks it. When the admin clicks Approve, `prisma.company.update` raises a validation error that `withErrors` can only report as a generic 500. The admin sees "Something went wrong" with no indication which field, and the request is stuck in the queue permanently.
2. **Public payload inflation.** A provider merges an oversized `gallery` or `about` into a request alongside an innocuous-looking name change (`submit()` *merges* into the existing pending request, so fields accumulate across submissions). Approved, it inflates a public response served to every visitor of the listing page.
3. **Sanitization bypass.** `about`/`tagline` skip `stripHtml`, so markup persists in the database. React escapes it on render, so this is not XSS today — but it defeats the stated "the API must not persist markup" invariant, and any future non-React consumer (an email, an export, a partner feed) inherits the problem.

**Impact:** Availability (admin approval queue), Integrity (stored data violates its own constraints), Business logic (bypasses the validation the parallel admin path enforces).

**Recommendation:** validate `changes` against a per-entity partial schema at **both** submit and approve, mirroring `assertEditableFields`'s two-point enforcement (the reasoning at `changeRequests.service.ts:99-102` applies identically):

```ts
const ENTITY_SCHEMAS: Record<ChangeEntity, z.ZodTypeAny> = {
  COMPANY:       updateCompanySchema,
  OFFERING:      updateOfferingSchema,
  OFFERING_TIER: updateOfferingTierSchema,
  BUNDLE_RULE:   updateBundleRuleSchema,
};
// in submit() and in review(), after assertEditableFields:
ENTITY_SCHEMAS[entity].parse(changes);
```

---

## M-04 — No request-body size limit on authenticated routes

**Severity:** MEDIUM · **Confidence:** CONFIRMED

**Location:** ~50 route files under `api/src/app/api/admin/` and `api/src/app/api/provider/`

**Vulnerability:** `readJsonObject` (which caps bodies at 64 KB) is used only on public endpoints. Every authenticated route calls bare `await request.json()`.

**Evidence:** across `api/src/app/api`, 66 occurrences in 54 files. `readJsonObject` appears in the public submit routes (`leads`, `reviews`, `site-reviews`, `feedback`, `chat`, `waitlist`, `auth/login`) plus a handful of provider chat/offering routes. The remainder — including `admin/companies/[id]`, `admin/users/[id]`, `provider/change-requests` — read unbounded.

`api/src/lib/validation/companies.ts:41-42` already documents this: *"the admin write path that creates it reads the body with a bare `request.json()` — no size limit at all (unlike the public endpoints, which go through `readJsonObject`)."*

The effective ceiling is therefore whatever the transport allows: `deploy/Caddyfile:29` `max_size 55MB` and `next.config.ts:31` `proxyClientMaxBodySize: "55mb"` — both sized for **video uploads**, not JSON.

**Root cause:** the body cap was scoped to "unauthenticated", treating any authenticated caller as trusted. Providers are external parties.

**Attack scenario:** a provider POSTs a 55 MB JSON body to `/api/provider/change-requests`. Next buffers it, `JSON.parse` allocates it, and (if it parses) it is persisted into a `jsonb` column. Repeat: database growth and memory pressure against a single PM2 fork instance with `max_memory_restart: "1G"`, from an ordinary account, with no rate limit to slow it (M-05).

**Impact:** Availability, storage cost.

**Recommendation:** apply `readJsonObject(request)` on every authenticated JSON route. Its 64 KB default already suits admin payloads; pass a larger explicit cap for the few (e.g. a company update with 60 gallery URLs) that need it. A lint rule or a `contract.test.ts`-style route walker — the same technique `maintenance.coverage.test.ts` already uses to catch unwrapped public writes — would keep new routes from regressing.

---

## M-05 — No rate limiting anywhere behind authentication

**Severity:** MEDIUM · **Confidence:** CONFIRMED

**Location:** all `adminOnly` / `providerOnly` routes; notably `api/src/app/api/provider/upload/route.ts` and `api/src/app/api/admin/upload/route.ts`

**Vulnerability:** `rateLimit()` is called only from public endpoints (`leads`, `reviews`, `site-reviews`, `feedback`, `chat`, `chat/summaries`, `leads/track`, `waitlist/track`, `auth/login`). No authenticated route consumes any limit.

**Evidence:** `api/src/app/api/provider/upload/route.ts` in full:

```ts
export const POST = providerOnly(async (request: NextRequest) => {
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) { throw new ValidationError("Missing file", …); }
  return ok(await uploadService.upload(file, "projects"));
});
```

No limiter, no per-company quota. `upload.service.ts:34` permits 50 MB per gallery video.

**Attack scenario:** a provider loops 50 MB video uploads. Each is buffered into memory and, for images, decoded by `sharp` (up to 50 megapixels — `MAX_INPUT_PIXELS`). Against one PM2 fork with a 1 GB restart threshold, concurrent decodes exhaust memory; meanwhile the Supabase Storage bill grows without bound, and there is no lifecycle to reclaim it (L-08).

**Impact:** Availability, direct financial cost.

**Recommendation:** add per-user limits keyed on `user.id` (not IP — a provider's office is one NAT address) on uploads (e.g. 20/hour), change-request submits, and admin bulk operations. A per-company storage quota checked before upload would cap the cost side independently.

---

## M-06 — Authentication events are not logged

**Severity:** MEDIUM · **Confidence:** CONFIRMED

**Location:** `api/src/app/api/auth/login/route.ts`, `api/src/lib/services/audit.service.ts`

**Vulnerability:** `AuditLog` covers admin CRUD thoroughly — deletes, status changes, role changes, password resets (recording *that* a reset happened, never the value), change-request reviews, chat moderation. It records nothing about authentication.

**Evidence:** `audit.record` is called from the admin service/route layer. Neither `auth/login` nor `auth/logout` calls it. There is no record of a successful login, a failed login, an account-throttle trip, or a session being established.

**Attack scenario:** following C-01, an attacker forges an admin JWT and never touches `/auth/login` at all — so even perfect login logging would not catch that. But it means you currently cannot answer the question *"did anyone sign in as an admin that we cannot account for?"*, which is exactly the question incident response asks first. Credential stuffing is likewise invisible: the per-account throttle at `login/route.ts:47` fires silently.

**Impact:** Detection and forensics. This is a *response* capability gap, not an exploitable flaw — but it materially raised the cost of investigating C-01.

**Recommendation:** log `auth.login.success`, `auth.login.failure` (email + source IP, never the password) and `auth.ratelimit.trip`. Since `AuditLog.actorId` is required, either relax it for pre-auth events or use a separate table/structured log stream. Also record the source IP on admin actions — `clientIp(request)` already exists.

---

## M-07 — Weak password policy, and no self-service password management

**Severity:** MEDIUM · **Confidence:** CONFIRMED

**Location:** `api/src/lib/validation/users.ts:7`

**Evidence:**

```ts
const password = z.string().min(8).max(72);
```

Eight characters, no complexity requirement, no breach-corpus check, no similarity check against the email. Hashing itself is correct (bcrypt, 12 rounds, `verifyPasswordSafe` with a constant-time dummy compare).

There is no self-service password-change endpoint and no password-reset flow anywhere in the 101 routes. `updateUserSchema` accepts `password`, and only `adminOnly` routes can call it.

**Attack scenario:** `password123` is accepted. The per-IP (10/min) and per-account (10 per 15 min) throttles slow online guessing but do not stop a patient distributed attempt against a weak password. Separately: because only an admin can set a provider's password, **an admin necessarily knows every provider's password** at the moment they set it, and the provider cannot change it — so a password is never a secret between one person and the system.

**Impact:** Authentication, non-repudiation.

**Recommendation:** raise the minimum to 12, add a check against a common-password list (`zxcvbn` or a local top-10k list — no network dependency needed), and add `PATCH /api/auth/password` requiring the current password. That last one is the more valuable of the two.

---

## M-08 — Bot and distributed-abuse controls are configured but switched off

**Severity:** MEDIUM · **Confidence:** HIGH CONFIDENCE (verify against the server's `api/.env`)

**Location:** `api/.env` — `RECAPTCHA_SECRET_KEY`, `TURNSTILE_SECRET_KEY`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` all empty

**Evidence:** `captcha.ts:18-32` returns `null` from `provider()` when neither secret is set, and `verifyCaptcha` becomes a no-op. `rateLimit.ts:124-126` falls back to the in-memory store when Redis is unconfigured. Since the site is live and `rateLimitConfigError` throws at boot otherwise, `RATE_LIMIT_ALLOW_INMEMORY=1` must be set on the server.

**Impact:**

* The only bot control on public submits is the `hp_field` honeypot, which any targeted script bypasses in one line.
* The in-memory limiter resets on every process restart — **including every deploy**. `deploy/_build.sh` restarts PM2, so a deploy clears every login-failure counter and every lead-flood counter. An attacker who can observe deploys (or simply retries) gets a fresh budget.
* The 15-minute per-account login throttle survives only as long as the process does.

**Recommendation:** enable Turnstile (`TURNSTILE_SECRET_KEY` + `VITE_TURNSTILE_SITE_KEY` — the frontend `Captcha.tsx` component already exists), and set the two `UPSTASH_*` variables so limits survive restarts. Both are free at this scale. Consider `CAPTCHA_FAIL_CLOSED=1` on `/api/leads` specifically.

---

# 7. Low Findings

## L-01 — Lead reference numbers use `Math.random()`

`api/src/lib/utils/refNumber.ts:9` — `ALPHABET[Math.floor(Math.random() * ALPHABET.length)]`. Non-cryptographic PRNG for a 4-character suffix (36⁴ ≈ 1.68 M per day). The reference is **not** the credential — `trackingToken` (18 crypto-random bytes, ~144 bits, constant-time compared) is — so this is not directly exploitable. It does make references enumerable for volume inference and pairs badly with L-02. **Fix:** use `randomBytes` from `node:crypto`; it is a two-line change in a function that already exists.

## L-02 — Legacy leads fall back to phone-tail matching

`api/src/lib/services/leads.service.ts:330`:

```ts
return typeof secret.phone === "string" && phoneTail(lead.phone) === phoneTail(secret.phone);
```

Applies only when `trackingToken` is null (rows predating `20260626150000_lead_tracking_token`). A phone tail is low entropy and often known to an attacker; combined with a guessable `refNumber` (L-01) it gates a lead's full record and its private chat thread. `/api/leads/track` is limited to 20/min/IP, which slows but does not prevent guessing. **Fix:** run `SELECT count(*) FROM "Lead" WHERE "trackingToken" IS NULL`. If zero (likely, given the migration history), delete the fallback branch. If not, backfill tokens and then delete it.

## L-03 — `imageRef` accepts any external URL and any `data:image/*`

`api/src/lib/validation/shared.ts:7` accepts `^https?://`, `^data:image/`, or any `/`-prefixed path. `data:image/svg+xml,<svg onload=…>` passes. It is inert in an `<img src>` (SVG scripting does not run there), and external hosts would be blocked by `img-src 'self' data: https://*.supabase.co` — **if the CSP were enforced** (M-01). Arbitrary external image URLs also let a company owner beacon every profile visitor's IP to a third-party host. **Fix:** restrict `data:` to a raster allowlist, and restrict `https:` to your storage host(s).

## L-04 — Login still returns the JWT in the response body

`api/src/app/api/auth/login/route.ts:67-80` returns `{ token, user }` *and* sets the httpOnly cookie. `app/src/lib/auth.ts:67` destructures only `{ user }` — the frontend migration to cookies is complete. The token in the body is now dead weight that lands in browser memory, any intermediary that logs response bodies, and error-reporting tooling. **Fix:** drop `token` from `ApiAuthResponse`. (`api/src/lib/auth.ts:4-6` still documents the old localStorage design — see I-01.)

## L-05 — Push subscriptions can be re-pointed by endpoint

`api/src/app/api/push/subscribe/route.ts:21` upserts on the unique `endpoint` and sets `userId: user.id` in **both** the create and update branch. A user who learns another user's endpoint URL claims that device: the victim stops receiving their own notifications and starts receiving the attacker's. The endpoint is high-entropy and not exposed by any API, so this needs a prior leak. It is also deliberate (the comment describes re-pointing a shared device). **Fix:** if the row exists under a different `userId`, delete and recreate rather than re-point — or at least audit-log the transfer.

## L-06 — CAPTCHA fails open on verifier outage

`api/src/lib/middleware/captcha.ts:65-76` allows the submission through when the verifier is unreachable, unless `CAPTCHA_FAIL_CLOSED=1`. This is a documented, defensible availability trade-off. Worth revisiting for `/api/leads` specifically, where a flood is more costly than a few rejected legitimate submissions. **Status: accepted by design** — noted for completeness.

## L-07 — Nested git repository at `app/.git`

`app/` contains its own complete git repository (`objects/`, `refs/`, `logs/`, `FETCH_HEAD`, `ORIG_HEAD`). The parent repo cannot track inside it, so the parent's `.gitignore` review does not cover its history. `app/.env.local` exists on disk and is ignored by `app/.gitignore` — but only *that* file's history is worth confirming. **Fix:** run `git -C app log --all --diff-filter=A --name-only -- .env.local` to check, then remove `app/.git` if the nested repo is a leftover.

## L-08 — Uploaded objects are never deleted

`api/src/lib/services/upload.service.ts` provides upload only — no delete path exists anywhere in the codebase. Removing a gallery image, a project or an entire company orphans its storage objects permanently (440 currently exist). The four buckets have `file_size_limit: null` and `allowed_mime_types: null` at the bucket level; all limits live in application code, so anything reaching Storage with the service-role key is unconstrained. **Fix:** set bucket-level size and MIME limits as defence in depth, and add a cleanup path (or a reconciliation job) for deleted entities.

## L-09 — `SECURITY DEFINER` function executable by `anon`

Supabase advisors flag `public.rls_auto_enable()` as callable by `anon` and `authenticated` via `/rest/v1/rpc/rls_auto_enable`. I read the definition: it is an **event-trigger** function (`RETURNS event_trigger`) owned by `postgres`, with `SET search_path TO 'pg_catalog'`, whose body only enables RLS on newly created `public` tables. Event-trigger functions cannot be invoked directly from SQL or PostgREST, so the practical risk is nil — and its purpose is defensive (it is why every table has RLS on). Still, the grant is unnecessary. **Fix:** `REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM anon, authenticated;`

## L-10 — `esbuild@0.21.5` (dev-server request forwarding)

Pulled in by `vite@5.4.21` in `app/`. Versions ≤ 0.24.2 are affected by GHSA-67mh-4wv8-2f99: the dev server responds to requests from any origin, so a malicious page open in the same browser can read dev-server source. **Development only** — it is not in the production bundle and `dist/` contains no source maps (verified). **Fix:** upgrade to Vite 6/7 when convenient; until then, do not browse untrusted sites while `npm run dev:app` is running.

---

# 8. Informational Findings

**I-01 — `api/SECURITY.md` is materially out of date.** It states "JWT returned in body … TTL via `JWT_TTL` (default 7d)" (actual default is `1d`, and auth is now an httpOnly `SameSite=Strict` cookie), "localStorage tokens are XSS-exposed by design" (no longer true), and "honeypot `website` field" (the field is `hp_field`, deliberately renamed so password managers do not autofill it). `api/src/lib/auth.ts:4-6` carries the same stale localStorage note. Stale security documentation causes real mistakes — someone will read this and conclude the token is in localStorage.

**I-02 — `app/vercel.json` CSP contains a literal placeholder:** `connect-src 'self' https://REPLACE-WITH-API-DOMAIN`. Harmless on the Caddy deployment (the file is unused there), but it would ship broken if anyone deployed to Vercel.

**I-03 — Internal UUIDs in public payloads.** `serialize.ts:284` returns `company.id` on public endpoints. Deliberate (the frontend needs it) and low-value to an attacker since every authorization decision is server-side. Noted, not a defect.

**I-04 — Supabase Auth "leaked password protection" disabled.** Flagged by the security advisor. **Not applicable** — the application implements its own bcrypt authentication and does not use Supabase Auth at all. Ignore this advisory. (The equivalent control for *your* auth is M-07.)

---

# 9. Authentication Audit

**Result: PASS with defects (M-06, M-07, L-04) — and completely undermined by C-01.**

| Check | Result | Notes |
|---|---|---|
| Authentication bypass | PASS | No route reachable without a valid session |
| Login bypass | PASS | `verifyPasswordSafe` returns false for a null hash regardless of compare result |
| Password hashing | PASS | bcrypt, 12 rounds |
| Password requirements | **FAIL** | min 8, no complexity, no breach check (M-07) |
| Password reset | N/A | No reset flow exists |
| Self-service password change | **FAIL** | Does not exist; admin-set only (M-07) |
| Email verification bypass | N/A | No email verification (accounts are admin-created) |
| Account enumeration | PASS | Generic 401 message; `DUMMY_HASH` equalises response timing; per-account throttle keyed by email fires identically whether or not the account exists |
| Brute force / credential stuffing | PARTIAL | 10/min per IP + 10 failures/15 min per account; counts failures only, so no self-lockout DoS. Weakened by in-memory reset on deploy (M-08) |
| Session fixation | PASS | No pre-auth session; the cookie is set only on successful login |
| Session hijacking | PASS | httpOnly + `SameSite=Strict` + `Secure` in production |
| Session expiration | PASS | `maxAge` tracks `JWT_TTL`; cookie and token expire together |
| Logout invalidation | PARTIAL | Cookie cleared server-side; the JWT itself stays valid until expiry. Documented; `isActive=false` is the hard-revocation path |
| Refresh tokens | N/A | Not implemented |
| JWT algorithm | PASS | HS256 fixed at sign; `jose.jwtVerify` rejects `alg: none` and algorithm confusion |
| JWT expiration | PASS | `setExpirationTime(TOKEN_TTL)`, verified by `jose` |
| JWT issuer / audience | PARTIAL | Neither set nor validated. Single-issuer deployment, so low impact — but adding `iss`/`aud` costs two lines and closes a whole class |
| Weak JWT secret | PASS *by control* / **FAIL by exposure** | `secretKey()` refuses < 32 chars in production. The secret is 66 chars — and is in C-01 |
| Token in localStorage | PASS | Cookie-based; `app/src/lib/api.ts:66` confirms no JS-readable token |
| Cookie flags | PASS | `httpOnly: true`, `sameSite: "strict"`, `secure` in production, `path: "/"` |
| Open redirect at auth | PASS | No redirect parameter exists in the login flow |
| Role trusted from client | PASS | The role in the JWT is re-read from the `User` row on every request (`getAuthUser`), so a stale or forged claim in a token body cannot outlive the DB |
| Inactive-account revocation | PASS | `getAuthUser` rejects `isActive: false` on every request |

**Notable positive:** `getAuthUser` re-loads the user from the database on every request rather than trusting the token's `role`/`companyId` claims. That means demoting or deactivating a user takes effect on their next request — the correct trade-off for a system without a token denylist, and it is the reason a stolen token has a bounded blast radius.

---

# 10. Authorization Audit

**Result: PASS. This is the strongest area of the codebase.**

I answered the six required questions for every sensitive endpoint. The answers are uniform:

1. **Who can call it?** Enforced by exactly one of four composition helpers in `api/src/lib/middleware/guards.ts` — `authed`, `adminOnly`, `providerOnly`, or bare `withErrors` for genuinely public routes. Verified across all 101 route files: 47 admin routes are `adminOnly`, 24 provider routes are `providerOnly`, 3 push routes are `authed`, and the remainder are public by design.
2. **How is identity established?** `getAuthUser` → JWT verification → fresh `User` row lookup. Never from a header, body field or query parameter.
3. **How is authorization established?** `withRole` compares `user.role` against a literal. Ownership is `assertOwnership(user, resourceCompanyId)` or an explicit service-layer `companyId` scope.
4. **Is ownership verified?** Yes, and in the service layer rather than the route. Representative samples I traced end to end:
   * `chat.assertProviderAccess(conversationId, companyId)` — 403 if the thread belongs to another company;
   * `leadsService.getOwnerCompanyId(id)` then `assertOwnership` — 404 for missing, 403 for someone else's;
   * `changeRequests.submit` → `ownerCompanyId(entity, live)` compared against the caller's company, including the indirect `OfferingTier → Offering → companyId` hop;
   * `offerings`, `projects`, `busy-windows`, `waitlist` — all scoped by `user.companyId` at the query level.
5. **Is authorization server-side?** Yes, without exception.
6. **Can the client influence the decision?** **No.** This is the finding that matters most. Across all 24 provider routes, `companyId` is read from `user.companyId` — the session — and never from the request. There is no route where a client-supplied `companyId`, `userId`, `role` or `isAdmin` reaches an authorization decision.

| Attack class | Result |
|---|---|
| IDOR / BOLA | PASS — no instance found |
| Broken function level authorization | PASS — every admin route wrapped |
| Horizontal privilege escalation (provider → provider) | PASS |
| Vertical privilege escalation (provider → admin) | PASS |
| Cross-company data access | PASS |
| Cross-message / cross-conversation access | PASS |
| Mass assignment on approval | PASS — `EDITABLE_FIELDS` allowlist enforced at both submit and approve, with `slug`, `status`, `verified`, `featured`, `rating`, `reviewCount`, `telegram*` deliberately excluded |
| Direct admin URL access | PASS — the SPA's `AuthGate` is UI-only, and every underlying API call is independently gated |
| Method-based bypass | PASS — Next.js only routes explicitly exported verbs |
| Last-admin lockout | PASS — `assertNotLastAdmin` guards demote, deactivate and delete |
| Customer (accountless) access | PASS — `refNumber` + `trackingToken` compared in constant time; a missing reference and a wrong token return an identical 404 |

**Notable positive:** the batch endpoint `POST /api/chat/summaries` verifies each claim independently against its own lead (`resolveCustomerLeads`), and groups claims by reference rather than using a `Map` — because a `Map` keeps only the last entry for a repeated key, which would have discarded a valid secret. Batching grants nothing that asking one at a time would not. That is a subtle bug class, and it was already handled.

---

# 11. API Security Audit (OWASP API Top 10)

| # | Risk | Result | Evidence |
|---|---|---|---|
| API1 | Broken Object Level Authorization | **PASS** | See §10 |
| API2 | Broken Authentication | **PARTIAL** | Architecture sound; M-07 weak passwords, M-06 no logging, C-01 signing key leaked |
| API3 | Broken Object Property Level Authorization | **PARTIAL** | `EDITABLE_FIELDS` allowlist is exemplary; public/admin serializers are correctly separated; but M-03 leaves property *values* unvalidated |
| API4 | Unrestricted Resource Consumption | **FAIL** | M-04 (no body cap when authenticated), M-05 (no authenticated rate limit), L-08 (no storage lifecycle) |
| API5 | Broken Function Level Authorization | **PASS** | All 47 admin routes `adminOnly`; all 24 provider routes `providerOnly` |
| API6 | Unrestricted Access to Sensitive Business Flows | **PASS** | Lead submit has per-IP + site-wide + per-company circuit breakers, honeypot, dedup window, and a CAPTCHA hook (unset — M-08) |
| API7 | Server-Side Request Forgery | **FAIL** | M-02 push endpoint. Other outbound calls (Resend, Telegram, Sentry, Upstash, CAPTCHA verifiers) all use fixed, non-user-controlled URLs |
| API8 | Security Misconfiguration | **FAIL** | H-03, M-01, M-08 |
| API9 | Improper Inventory Management | **PASS** | No versioning, no deprecated routes, no debug/test endpoints. `/api/health`, `/api/ready`, `/api/status`, `/api/sitemap` are intentional and leak nothing (`health` returns `{ok:true}`; `ready` runs `SELECT 1`) |
| API10 | Unsafe Consumption of APIs | **PASS** | Telegram webhook verifies `x-telegram-bot-api-secret-token` and refuses to process when unconfigured; CAPTCHA verifier responses are checked for `success === true`; Upstash errors fall back to the in-memory limiter rather than failing open to no limit |

**Additional checks:** excessive data exposure — PASS (separate serializers; `passwordHash`, `email`, `whatsapp`, `telegramChatId`, `telegramLinkToken`, `trackingToken` never in public payloads; `trackingToken` is returned exactly once, on lead creation). Pagination — PASS (`clampPage`/`clampPageSize` centralised, `MAX_PAGE = 100_000`, per-service `MAX_PAGE_SIZE`). Parameter pollution — PASS (`URLSearchParams.get` takes the first value; all enum-ish parameters are allowlisted). Error handling — PASS (`withErrors` maps everything unknown to a generic 500).

---

# 12. Supabase / RLS Audit

**Result: PASS on RLS. FAIL on key management (C-01) and lifecycle (H-01).**

## Service-role key handling

| Check | Result |
|---|---|
| Never exposed to browser code | **PASS** — used only in `api/src/lib/supabase.ts`, a server module |
| Never in the client bundle | **PASS** — verified by grepping `app/dist/assets/*.js` for `supabase`, `service_role`, `eyJhbGciOi`, `sb_secret`, `JWT_SECRET`: **zero matches**. `app/` has no Supabase dependency at all |
| Never prefixed `NEXT_PUBLIC_` | **PASS** — `SUPABASE_SERVICE_ROLE_KEY` is correctly unprefixed (only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` carry the prefix, and both are public by design) |
| Never returned by an API | **PASS** |
| Never logged | **PASS** |
| **Not committed to VCS** | **FAIL — see C-01** |

## Row Level Security — per table

Verified against the live project. **RLS is enabled on every table, with zero policies** — which for PostgREST means deny-all for `anon` and `authenticated`. The application connects as the `postgres` role (which carries `BYPASSRLS`) via Prisma, so this is a correct and deliberate architecture: **all authorization is enforced in the application layer, and the REST API surface is closed.**

| Table | RLS | Policies | SELECT | INSERT | UPDATE | DELETE | Anon access |
|---|---|---|---|---|---|---|---|
| `User` | Enabled | none | deny | deny | deny | deny | **None** |
| `Company` | Enabled | none | deny | deny | deny | deny | **None** |
| `Lead` | Enabled | none | deny | deny | deny | deny | **None** |
| `Review` | Enabled | none | deny | deny | deny | deny | **None** |
| `Project` | Enabled | none | deny | deny | deny | deny | **None** |
| `Category` | Enabled | none | deny | deny | deny | deny | **None** |
| `SiteReview` | Enabled | none | deny | deny | deny | deny | **None** |
| `Feedback` | Enabled | none | deny | deny | deny | deny | **None** |
| `WaitlistEntry` | Enabled | none | deny | deny | deny | deny | **None** |
| `AppSetting` | Enabled | none | deny | deny | deny | deny | **None** |
| `AuditLog` | Enabled | none | deny | deny | deny | deny | **None** |
| `PushSubscription` | Enabled | none | deny | deny | deny | deny | **None** |
| `_prisma_migrations` | Enabled | none | deny | deny | deny | deny | **None** |

* `USING (true)` — **none found.**
* `WITH CHECK (true)` — **none found.**
* Overly permissive policies — **none exist**, because no policies exist.
* Can authenticated users read others' records / modify what they don't own / change ownership fields? **No** — PostgREST access is denied outright; the application path is covered in §10.

**The mechanism that keeps this true:** an event trigger calling `public.rls_auto_enable()` enables RLS automatically on every new `public` table. So a table added by a future Prisma migration is closed by default rather than open. That is a genuinely good piece of defensive infrastructure. (Its `EXECUTE` grant should still be revoked — L-09.)

**Advisor output** (13 × `rls_enabled_no_policy` at INFO) is expected and benign for this architecture, not a set of findings. Supabase raises it because "RLS on, no policies" usually means someone forgot; here it is the intent.

## Storage

| Bucket | Public | Size limit | MIME allowlist | Objects |
|---|---|---|---|---|
| `logos` | **Yes** | none | none | — |
| `covers` | **Yes** | none | none | — |
| `gallery` | **Yes** | none | none | — |
| `projects` | **Yes** | none | none | 440 total across all four |

* **Upload policies:** `storage.objects` has RLS enabled with **zero policies** → `anon` and `authenticated` cannot write. All writes go through the service-role key, server-side, behind `adminOnly`/`providerOnly`. **PASS.**
* **Download policies:** buckets are public-read. Correct for logos/covers/gallery/projects; these are meant to be on public profile pages.
* **File enumeration:** object names are `randomUUID()` + extension, so listing is not possible and guessing is infeasible. **PASS.**
* **Filename manipulation / path traversal:** the client never supplies a name — `upload.service.ts:205,216` generates it. **PASS.**
* **MIME validation:** enforced in application code, and enforced *from the bytes*, not the label — images are decoded and re-encoded to WebP by `sharp` (a non-image simply fails), and videos are container-sniffed by `sniffVideoMime` reading the ISO-BMFF `ftyp` brand or the EBML magic. The stored content type comes from the sniff, never from the client. **PASS — this is notably better than typical.**
* **SVG / HTML / executable uploads:** rejected. `ALLOWED_MIME` is JPEG/PNG/WebP/AVIF only; anything else fails `sharp` decoding. **PASS.**
* **Oversized uploads:** 5 MB images / 50 MB gallery videos, plus a 50-megapixel decompression-bomb cap (`MAX_INPUT_PIXELS`), plus Caddy's 55 MB edge cap. **PASS** — though see M-05 (no rate limit on repeated uploads) and L-08 (no bucket-level limits as defence in depth).
* **Delete authorization:** **no delete path exists** (L-08).

---

# 13. Database Audit

| Check | Result |
|---|---|
| Schema constraints | **PASS** — extensive. `@unique` on `refNumber`, `email`, `slug`, `endpoint`, `telegramLinkToken`, `Conversation.leadId`, `Review.leadId`, `WaitlistEntry.convertedLeadId` |
| Partial unique indexes | **PASS** — `change_request_one_pending` and `company_category_one_primary` are hand-written SQL because Prisma cannot express a `WHERE` clause on an index. Both are documented in `schema.prisma` |
| Foreign keys & cascade behaviour | **PASS** — deliberate throughout: `Cascade` for owned children, `SetNull` where history must survive (`Review.leadId`, `LeadItem.offeringId`, `User.companyId`), `Restrict` on `CompanyCategory.categoryId` so a category in use cannot vanish |
| Indexes | **PASS** — composite indexes match the actual hot queries (`[companyId, status, createdAt]`, `[companyId, approved, createdAt]`, `[conversationId, createdAt]`) |
| Integer overflow | **PASS** — `MAX_INT4` guard in `leadItems.service.ts:152-164` rejects a basket whose arithmetic would not fit `int4`, turning a driver-level 500 into a clean 400 |
| Triggers | **PASS** — one event trigger, `rls_auto_enable`, and it is a security control |
| SECURITY DEFINER functions | **PARTIAL** — one, correctly `SET search_path TO 'pg_catalog'`; only its grant is over-broad (L-09) |
| `search_path` issues | **PASS** — explicitly pinned |
| Unsafe dynamic SQL | **PASS** — the only `EXECUTE format(...)` is inside `rls_auto_enable`, interpolating `cmd.object_identity` from `pg_event_trigger_ddl_commands()` (a system catalog, not user input) |
| Views / stored procedures | N/A — none |
| Mutable ownership fields | **PASS** — `companyId` is never client-writable on any provider route; it is excluded from `EDITABLE_FIELDS` |
| Sensitive columns readable | **PASS** — `passwordHash` never appears in any serializer; `users.service.ts` `serialize()` omits it structurally |
| Excessive DB privileges | **PARTIAL** — the app connects as `postgres` (`BYPASSRLS`, effectively owner). A dedicated least-privilege application role with only `SELECT/INSERT/UPDATE/DELETE` on `public` would reduce the blast radius of an application compromise |
| Race conditions | **PASS** — the one-time review claim (`updateMany` with `reviewedAt: null` in a transaction, backstopped by the `Review.leadId` unique index), `Conversation.leadId` unique making concurrent opens upsert-safe, and `P2002`-aware retry on `refNumber` generation. There is an integration test asserting the `xmin` behaviour |

---

# 14. Frontend Security Audit

**Result: PASS on code. FAIL on headers (H-03, M-01).**

| Check | Result |
|---|---|
| `dangerouslySetInnerHTML` | **PASS** — zero occurrences in `app/src`. The only `innerHTML` uses in the repo are in `UI-UX-AUDIT.html` and `deliverables/provider-dashboard-demo.html`, which are standalone offline artefacts, not shipped app code |
| Markdown rendering | **PASS** — `app/src/components/Markdown.tsx` is a hand-written renderer producing React elements. It supports only paragraphs, bold, italic and lists — deliberately **no links**, so there is no `javascript:` URL sink at all |
| Stored XSS (reviews, messages, descriptions) | **PASS** — server-side `stripHtml` on write plus React escaping on render. Two independent layers |
| Reflected / DOM XSS | **PASS** — no `document.write`, no `eval`, no `new Function`. `locale-init.js` reads `?lang=` but only compares it against the literals `"ar"` and `"en"` |
| Mutation XSS | **PASS** — no HTML parsing path in the client |
| Token in localStorage | **PASS** — only a non-secret user *profile* cache under `al-assema-user`, explicitly documented as a UX cache. `app/src/lib/api.ts:62-68` sends no `Authorization` header |
| Secrets in the bundle | **PASS** — grepped `app/dist/assets/*.js`: zero matches for Supabase keys, JWT patterns, or API keys |
| Source maps in production | **PASS** — zero `.map` files in `app/dist` |
| Third-party scripts | **PASS** — the only external origins are Google Fonts (`fonts.googleapis.com`, `fonts.gstatic.com`). No analytics SDK, no tag manager; `app/src/lib/analytics.ts` is local chart maths, not tracking |
| `postMessage` / iframe communication | **PASS** — not used |
| Client-side auth gating | **PASS by design** — `AuthGate.tsx` is UI-only and says so; every API call is independently authorized server-side. Hiding a button is not treated as authorization anywhere |
| Demo-mode fallback | **PASS** — when `VITE_API_URL` is unset the dashboards open without auth, but `app/src/lib/auth.ts:28-37` warns loudly on any non-localhost host. Confirm `VITE_API_URL=/api` is set in the production build |
| Enforced CSP | **FAIL** — M-01 |
| Security headers on the SPA origin | **FAIL** — H-03 |

**Sensitive data in URLs:** `/api/leads/track?ref=…&token=…` puts the tracking token in a query string, where it reaches access logs. The team already recognised this — `customerGuard.ts:5-11` explains why the *chat* endpoints moved the token to an `X-Lead-Token` header (a polling chat writes it hundreds of times per conversation instead of once per visit) and `chat/summaries` uses POST for the same reason. The tracking endpoint's once-per-visit exposure is the accepted remainder. Worth revisiting alongside `Referrer-Policy` (H-03).

---

# 15. Admin Dashboard Audit

**Result: PASS.** Treated as a separate attack surface; no admin-specific weakness found beyond the global ones.

| Check | Result |
|---|---|
| Authentication | PASS — all 47 routes wrapped in `adminOnly` |
| Authorization | PASS — `withRole("ADMIN")` compares against the DB-loaded role |
| Admin route protection | PASS — the SPA route guard is cosmetic; the API is the real boundary |
| Privilege escalation | PASS — `role` is only settable via `adminOnly` `PATCH /api/admin/users/[id]`; `assertNotLastAdmin` prevents lockout |
| IDOR | PASS — admins are legitimately authorized for all objects, and nested routes verify parent/child linkage (e.g. `setMessageHidden` checks `message.conversationId !== conversationId`) |
| XSS in the dashboard | PASS — same React escaping; admin-entered legal pages go through `Markdown.tsx` |
| CSRF | PASS — `SameSite=Strict` (see §–CSRF below) |
| Session expiration / logout | PASS — cookie cleared server-side; token expiry bounded by `JWT_TTL` |
| Sensitive exports | PASS — CSV/lead exports are `adminOnly` |
| Delete & bulk operations | PASS — audit-logged via `audit.record` with actor id and email |
| Settings changes | PASS — `adminOnly` + audited |
| Message access | PASS — admins see all threads by design, with hidden-message moderation that preserves the row rather than deleting it |
| Rate limiting on admin ops | **FAIL** — M-05 |
| Body size limits | **FAIL** — M-04 |
| Login logging | **FAIL** — M-06 |

**Notable positive:** `audit.record` is called with `meta: { fields: Object.keys(input), passwordReset: input.password !== undefined }` — it records *that* a password was reset without ever recording the value. Exactly right.

## CSRF (Phase 9) — PASS

Every state-changing verb is covered structurally rather than by tokens:

* The session cookie is `SameSite=Strict`, so it is not sent on **any** cross-site request — including top-level navigations, form posts and `fetch`. This is a complete structural defence for a same-origin deployment, and it is why no CSRF token is needed.
* `Access-Control-Allow-Credentials: true` is only ever paired with a specific allowlisted origin, never `*` (`proxy.ts:30-37`), and with `SameSite=Strict` the cookie would not flow cross-origin anyway.
* Login CSRF, password-change CSRF, email-change CSRF, admin-action CSRF: all blocked by the same mechanism.
* `apiUpload` sends `multipart/form-data` (a CORS-"simple" request that skips preflight) — still blocked, because the cookie is not attached.

The one caveat: `resolveToken` also accepts an `Authorization: Bearer` header. A bearer token is immune to CSRF by construction (an attacker's page cannot set it), so this does not weaken anything. Since the frontend no longer uses it, removing the header path would simplify the model (see L-04).

---

# 16. Dependency Audit

`npm` is not on this shell's PATH, so `npm audit` could not be executed. Analysis is static, from both lockfiles.

## api/

| Package | Version | Assessment |
|---|---|---|
| `next` | 16.2.9 | Current |
| `react` / `react-dom` | 19.2.4 | Current |
| `@prisma/client` / `prisma` | 7.8.0 | Current |
| `@supabase/supabase-js` | 2.108.2 | Current |
| `bcryptjs` | 3.0.3 | Current |
| `jose` | 6.2.3 | Current — actively maintained, correct JWT library choice |
| `zod` | 4.4.3 | Current |
| `sharp` | 0.35.2 | Current |
| `pg` | 8.22.0 | Current |
| `web-push` | 3.6.7 | Current |
| `esbuild` (transitive) | 0.28.1 | Above the GHSA-67mh-4wv8-2f99 threshold (≤ 0.24.2) — not affected |

**No known-vulnerable packages identified in `api/`.**

## app/

| Package | Version | Assessment |
|---|---|---|
| `vite` | 5.4.21 | Patched for the Vite-side advisories, but still on the esbuild 0.21 line |
| `esbuild` (transitive) | **0.21.5** | **GHSA-67mh-4wv8-2f99 — moderate, development-server only** (L-10) |
| `react` / `react-dom` | 18.3.1 | Supported; note the drift from `api/`'s React 19 |
| `react-router-dom` | 6.30.4 | Current for v6 |
| `tailwindcss` | 3.4.19 | Current for v3 |
| `postcss` | 8.5.15 | Above the 8.4.31 advisory threshold — not affected |
| `nanoid` | 3.3.12 | Above the 3.3.8 advisory threshold — not affected |
| `braces` | 3.0.3 | Above the 3.0.3 advisory threshold — not affected |

## Supply-chain posture

| Check | Result |
|---|---|
| Lockfiles committed | PASS — both `package-lock.json` files present, CI uses `npm ci` |
| Abandoned dependencies | PASS — none; the codebase deliberately avoids SDKs (Resend, Telegram, Sentry, Upstash are all called over plain `fetch`), which is a meaningfully smaller supply-chain surface than the alternative |
| Malicious / typosquatted packages | PASS — no suspicious names; every direct dependency is a well-known package |
| Dependency confusion | PASS — no private scopes, no custom registry |
| `postinstall` scripts | PARTIAL — `prisma` and `sharp` run install scripts (both expected and legitimate). Consider `npm ci --ignore-scripts` in CI with an explicit `prisma generate` step, which the workflow already runs separately |
| CI dependency install | PASS — `npm ci` pinned to the lockfile |

**Action:** re-run `npm audit --omit=dev` in both packages from a shell where npm is available, to confirm this static assessment against the live advisory database.

---

# 17. Infrastructure Audit

| Area | Result |
|---|---|
| Reverse proxy | Caddy, automatic HTTPS via Let's Encrypt |
| TLS | PASS by default — Caddy negotiates modern TLS automatically. **Verify against the live host** |
| HTTP → HTTPS redirect | PASS — Caddy automatic |
| HSTS | **FAIL** on the frontend origin (H-03); PASS on `/api/*` via `next.config.ts` |
| Request body limit | PASS — `max_size 55MB` at the edge, in step with `proxyClientMaxBodySize` and the app's upload caps |
| `X-Forwarded-For` handling | **PASS — and notably well done.** Caddy strips any client-supplied XFF and re-sets it from `{remote_host}`; `rateLimit.ts:42-57` then reads from the **right**, `TRUSTED_PROXY_HOPS` positions in, ignoring everything an attacker could inject on the left. A forged XFF cannot rotate past the per-IP limits |
| Host header attacks | PASS — the Caddy site block matches a single domain; nothing in the app builds URLs from the `Host` header (`PUBLIC_SITE_URL` is an env var) |
| Cache poisoning | PASS — `okCached` is applied only to unauthenticated responses that are identical for every caller; every authenticated/PII response is `no-store` or uncached |
| HTTP request smuggling | PASS (conceptual) — a single Caddy→Next hop, both modern implementations, no CDN in front |
| Method confusion | PASS — Next.js routes only explicitly exported verbs |
| Server version leakage | PARTIAL — Caddy sends `Server: Caddy` by default; add `-Server` (included in the H-03 fix) |
| Process model | PASS — PM2 fork mode, single instance, which is precisely what the in-memory rate limiter requires. `ecosystem.config.cjs` documents the coupling |
| Memory limits | PASS — `max_memory_restart: "1G"`, sized for concurrent `sharp` decodes |
| Backups | PASS on mechanism (nightly `pg_dump --format=custom`, local + optional off-site, retention pruning, dead-man's-switch heartbeat, `RESTORE.md` with a rehearsal instruction) / **FAIL on location** (H-02: dumps land inside the git working tree) |
| Rollback | PASS — `deploy/deploy.sh` records the pre-deploy SHA to `deploy/.rollback-sha` before moving `HEAD` |
| CORS | **PASS** — `resolveAllowedOrigin` (`proxy.ts:61-68`) denies by default in production when `CORS_ALLOWED_ORIGINS` is unset, reflects only exact allowlist matches, never reflects arbitrary origins, and never pairs `Allow-Credentials` with `*`. There is a unit test asserting the deny-by-default-in-production invariant. No wildcard, no null origin, no localhost in production, no subdomain trust |
| Optional API-key gate | PASS — `timingSafeEqual` over SHA-256 digests (correct for the Edge runtime, which has no `node:crypto`). Currently unset |
| Firewall / SSH / fail2ban | **NOT VERIFIED** — outside repository scope |
| DNS / SPF / DKIM / DMARC | **NOT VERIFIED** — per audit rules, no third-party systems were contacted. Email is sent via Resend, so confirm SPF and DKIM are published for the sending domain and DMARC is at least `p=none` with reporting |

---

# 18. Secrets Audit

**No secret value appears in this report.** Types and locations only.

| Secret type | File | Line/Location | Exposure | Severity |
|---|---|---|---|---|
| Production DB URL + password | `_backups/…tar.gz` → `api/.env` | `DATABASE_URL`, `DIRECT_URL` | **Committed to git; still valid** | CRITICAL |
| JWT signing secret | `_backups/…tar.gz` → `api/.env` | `JWT_SECRET` | **Committed to git; still valid** | CRITICAL |
| Supabase service-role key | `_backups/…tar.gz` → `api/.env` | `SUPABASE_SERVICE_ROLE_KEY` | **Committed to git; still valid** | CRITICAL |
| Supabase anon/publishable key | `_backups/…tar.gz` → `api/.env` | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Committed to git; public by design, but rotate with the service key | MEDIUM |
| Telegram bot token | `_backups/…tar.gz` → `api/.env` | `TELEGRAM_BOT_TOKEN` | **Committed to git; still valid** | HIGH |
| Telegram webhook secret | `_backups/…tar.gz` → `api/.env` | `TELEGRAM_WEBHOOK_SECRET` | **Committed to git; still valid** | HIGH |
| VAPID private key | `_backups/…tar.gz` → `api/.env` | `VAPID_PRIVATE_KEY` | **Committed to git; still valid** | HIGH |
| Frontend env (no secrets found) | `_backups/…tar.gz` → `app/.env.local` | — | Committed to git | LOW |
| Production DB URL + password | `api/.env.production.reference` | `DATABASE_URL`, `DIRECT_URL` | On disk only — **correctly gitignored** and correctly renamed so Next.js does not auto-load it | INFO |
| All live secrets | `api/.env` | various | On disk only — **correctly gitignored** | INFO |
| CI test secret | `.github/workflows/ci.yml` | `JWT_SECRET: ci-test-secret` | Committed — a throwaway value for an ephemeral CI database. **Not a real secret** | INFO |
| CI test DB password | `.github/workflows/ci.yml`, `api/docker-compose*.yml` | `postgres/postgres` | Committed — ephemeral local containers only | INFO |

## Presence in other artefacts

| Location | Result |
|---|---|
| Git history | **PARTIAL — the tarball is confirmed tracked in `.git/index`.** Full historical commit enumeration was not possible (`git` is not on this shell's PATH). Run `gitleaks detect --source . --log-opts="--all"` before considering the history clean |
| Build artefacts | PASS — `app/dist/assets/*.js` grepped for Supabase keys, JWT patterns and API keys: zero matches |
| Source maps | PASS — none present in `app/dist` |
| Frontend bundle | PASS — `app/` has no Supabase dependency and no server secret reaches it |
| CI environment | PASS — no production secrets in `ci.yml`; only throwaway values for the ephemeral Postgres service |
| Logs | PASS — no secret is logged. `report.ts` sends only `error.name`, `error.message`, one stack frame and a route string to Sentry. `audit.service` records field *names*, never values |

## Correctly handled — worth stating

The `.gitignore` rules for `.env` files are right, and `api/.env.production.reference` is a genuinely good piece of defensive naming: the file was renamed away from `.env.production` because **Next.js auto-loads `.env.production` at higher priority than `.env` whenever `NODE_ENV=production`**, which meant `npm start` on a developer's machine silently connected to the production database. There is a regression test (`src/lib/envSafety.test.ts`) that fails if the old name returns. That is exactly the right response to an incident: fix the class, then make the fix permanent with a test.

---

# 19. Business Logic Audit

| Flow | Result |
|---|---|
| Registration | N/A — accounts are admin-created; there is no public signup |
| Login | PASS (see §9) |
| Guest / accountless requests | PASS — `refNumber` + high-entropy `trackingToken`, constant-time comparison, identical 404 for both a bad reference and a wrong token |
| Lead submission | PASS — server resolves the company by slug and requires `ACTIVE`; 404 for both missing and suspended so suspended companies are not revealed |
| **Price manipulation** | **PASS** — the single most important check here, and it is right. `leadItems.service.ts:10-15`: *"What the client may send per line. Deliberately no prices."* The client sends only `offeringId`, `qty` and `tierId`; every price is read server-side from the live catalogue and snapshotted onto the lead |
| Draft/unpublished price abuse | PASS — `resolveItems` filters `isPublished: true, isActive: true` on both offerings **and** tiers, so a hand-made payload cannot name an unreviewed tier and be quoted from an unapproved price |
| **Discount manipulation** | **PASS** — and this one is subtle. A basket naming the same offering twice is *rejected, not merged*, because `calculateRequest` derives the bundle threshold from `items.length`; two lines for one offering would be a second "item" the customer never picked, enough to trip a `minItems: 2` rule and snapshot an unearned discount onto the lead. Only bundle rules with `isPublished && isActive` can affect a total |
| Quantity manipulation | PASS — `Math.min(MAX_QTY, Math.max(1, Math.trunc(qty) || 1))`, capped at 10,000; `MAX_ITEMS` 25 |
| Negative values | PASS — clamped to ≥ 1; Zod `.min(0)` on money fields |
| Integer overflow | PASS — `MAX_INT4` check rejects a basket that would overflow the columns (`leadItems.service.ts:152`) |
| Duplicate submission | PASS — 5-minute dedup window on (company, phone, service) → 409. Correctly documented as a UX/noise guard, not a security control |
| **One-time review** | **PASS** — conditional `updateMany` claim on `reviewedAt: null` inside a transaction (losers match 0 rows → 409), backstopped by the `Review.leadId` unique index. Requires `status === COMPLETED`. Reviews start unapproved and are excluded from the rating aggregate until moderated |
| Rating manipulation | PASS — aggregates recomputed from approved reviews only; the manual `ratingOverridden` path is admin-only and excluded from `EDITABLE_FIELDS` |
| Status manipulation | PASS — `leadStatusSchema` allowlists labels; providers may only transition their own company's leads |
| Workflow bypass (publish without review) | PASS — `isPublished` is not in `EDITABLE_FIELDS`; publishing goes through a `PUBLISH` change request, and approval re-checks the draft for drift (`findConflicts`) so what gets published is what the admin actually reviewed. `OfferingTier.isPublished` was added specifically to close the one path that previously skipped review |
| Unauthorized cancellation | PASS — `cancel()` scoped by `companyId` |
| Coupons | N/A — no coupon system |
| Checkout / payments | N/A — lead generation only; no payment flow exists |
| Race conditions | PASS (see §13) |

**Assessment:** the business-logic layer is the strongest part of this application. The defensive comments are not decoration — each names a specific failure that was reasoned through, and the code matches the reasoning.

---

# 20. Attack Surface Inventory

## API routes — 101 handler files

**Public / unauthenticated (24)**

`GET /api/health` · `GET /api/ready` · `GET /api/status` · `GET /api/sitemap` · `GET /api/settings` · `GET /api/pages` · `GET /api/categories` · `GET /api/categories/[slug]/companies` · `GET /api/companies` · `GET /api/companies/[slug]` · `GET /api/companies/[slug]/reviews` · `GET /api/companies/[slug]/waitlist` · `GET /api/projects/featured` · `GET /api/site-reviews` · `GET /api/site-reviews/settings` · `GET /api/leads/track` · `GET /api/waitlist/track` · `GET /api/chat` · **`POST`** `/api/leads` · `/api/reviews` · `/api/site-reviews` · `/api/feedback` · `/api/companies/[slug]/waitlist` · `/api/chat` · `/api/chat/summaries` · `POST /api/telegram/webhook` (secret-gated)

All public writes are wrapped in `withMaintenance` and carry rate limits, honeypots, bounded body reads and CAPTCHA hooks.

**Authentication (3)** — `POST /api/auth/login` · `POST /api/auth/logout` · `GET /api/auth/me`

**Any authenticated user (3)** — `GET /api/push/public-key` · `POST /api/push/subscribe` · `POST /api/push/unsubscribe`

**Provider only (24)** — availability, bundle-rules, busy-windows (+`[id]`), change-requests (+`[id]`), chat (+`[conversationId]`), leads, offerings (+`[id]`, `/publish`, `/tiers`, `/tiers/[tierId]`, `/visibility`), profile, projects (+`[id]`), stats, telegram (+`/link`), upload, waitlist (+`[id]`)

**Admin only (47)** — audit-logs, categories (+`[id]`), change-requests (+`[id]`), chat (+`[conversationId]`, `/messages/[messageId]`), companies (+`[id]` and 12 nested resources), email-templates, feedback (+`[id]`), leads (+`[id]`), maintenance, notification-settings, offerings/[id]/reference, pages, projects (+`[id]`), reviews (+`[id]`), settings, site-reviews (+`[id]`, `/settings`), stats, telegram (+`/link`), upload, users (+`[id]`), waitlist

## Frontend routes

Public: `/`, `/services`, `/services/:slug`, `/companies`, `/companies/:slug`, `/start`, `/request`, `/saved`, `/my-requests`, `/messages`, `/about`, `/contact`, `/legal/:page`. Guarded (UI-only; API is the real boundary): `/admin/*`, `/provider/*`. No hidden, debug, test or development routes found.

## Data stores

Postgres (Prisma, 21 models) · Supabase Storage (4 public buckets, 440 objects) · browser `localStorage` (non-secret UX cache: user profile, locale, saved companies, cart, lead references)

## External integrations

| Service | Direction | Auth | Notes |
|---|---|---|---|
| Resend (email) | Outbound | Bearer, fixed URL | Fail-open |
| Telegram Bot API | Outbound + **inbound webhook** | Bot token / `x-telegram-bot-api-secret-token` | Webhook refuses to process when the secret is unset |
| Web Push (FCM/Mozilla/…) | Outbound | VAPID | **User-controlled destination — M-02** |
| Sentry | Outbound | DSN, fixed URL | Optional; sends no PII |
| Upstash Redis | Outbound | Bearer, fixed URL | Optional; currently unset |
| Turnstile / reCAPTCHA | Outbound | Secret, fixed URL | Currently unset |
| Supabase Storage | Outbound | Service-role key | |

## Sensitive operations

Lead creation (customer PII) · lead status transitions · customer↔provider chat · review submission & moderation · company create/update/delete · user create/update/delete/role change · file upload · maintenance toggle · settings & email-template edits · change-request approval · audit-log read

---

# 21. Recommended Remediation Order

## P0 — Fix immediately (today)

1. **Rotate every secret listed in §18** — `JWT_SECRET`, Supabase database password, service-role key, anon key, Telegram bot token, Telegram webhook secret, VAPID keypair. Then update `api/.env` on the server and restart PM2. *(C-01)*
2. **Force a password reset for all 9 accounts.** Assume the database was readable. *(C-01)*
3. **Remove `_backups/` from git tracking and purge the archive from history**; force-push and have every collaborator re-clone. *(C-01)*
4. **Review Supabase logs and the `AuditLog` table** for unexplained activity since 2026-07-20. *(C-01)*

> Rotate before purging. Purging history without rotating changes nothing — the archive already exists in every clone and fork.

## P1 — Fix before the end of the week

5. Add `_backups/`, `backups/`, `*.tar.gz`, `*.dump`, `*.sql` to `.gitignore`; move `LOCAL_BACKUP_DIR` outside the repo; add a pre-commit secret scan and a staged-file-size guard to `ship.sh`. *(H-02)*
6. Decommission or wipe the abandoned Supabase project — after deciding explicitly whether it is still the Storage backend. *(H-01)*
7. Add the full security-header block to `deploy/Caddyfile`'s `handle`, and verify with `curl -I`. *(H-03)*
8. Enforce the CSP: drop `-Report-Only` after checking for violations. *(M-01)*

## P2 — Fix soon (this month)

9. Allowlist push endpoint hosts and require `https:`. *(M-02)*
10. Validate change-request `changes` values against per-entity schemas, at both submit and approve. *(M-03)*
11. Apply `readJsonObject` to all authenticated JSON routes; add a route-walker test to prevent regression. *(M-04)*
12. Add per-user rate limits on uploads, change-request submits and admin bulk operations. *(M-05)*
13. Log authentication events (success, failure, throttle trips) with source IP. *(M-06)*
14. Raise the password minimum to 12 with a common-password check; add `PATCH /api/auth/password`. *(M-07)*
15. Enable Turnstile and Upstash Redis — both free at this scale. *(M-08)*

## P3 — Hardening

16. Replace `Math.random()` with `randomBytes` in `refNumber.ts`. *(L-01)*
17. Backfill `trackingToken` for any legacy leads, then delete the phone-tail fallback. *(L-02)*
18. Tighten `imageRef` to a raster allowlist and your storage host. *(L-03)*
19. Drop `token` from the login response body. *(L-04)*
20. Audit-log push-subscription ownership transfers. *(L-05)*
21. Remove the nested `app/.git` repository after checking its history. *(L-07)*
22. Add bucket-level size/MIME limits and a storage cleanup path. *(L-08)*
23. `REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM anon, authenticated;` *(L-09)*
24. Upgrade Vite to 6/7 to move off `esbuild@0.21.5`. *(L-10)*
25. Rewrite `api/SECURITY.md` to match reality. *(I-01)*
26. Add `iss`/`aud` claims to the JWT and validate them. *(§9)*
27. Create a least-privilege Postgres application role instead of connecting as `postgres`. *(§13)*
28. Consider a dedicated `report-uri` endpoint for CSP violations.

---

# 22. Security Regression Checklist

Run after remediation. Each item is independently verifiable.

## Secrets
- [ ] `git log --all --full-history -- _backups/` returns nothing
- [ ] `gitleaks detect --source . --log-opts="--all"` reports zero findings
- [ ] Every secret's SHA-256 fingerprint **differs** from the values in §4 (`JWT_SECRET` ≠ `CD2045F013`, `SUPABASE_SERVICE_ROLE_KEY` ≠ `11F25BD6D4`, `TELEGRAM_BOT_TOKEN` ≠ `521E39FDAA`, `TELEGRAM_WEBHOOK_SECRET` ≠ `19CC5C2DBD`, `VAPID_PRIVATE_KEY` ≠ `99796EFADB`)
- [ ] A JWT signed with the old secret is rejected with 401
- [ ] The old Supabase database password fails to connect
- [ ] `git check-ignore -v _backups/ backups/ api/.env app/.env.local` matches all four
- [ ] `ship.sh` refuses to stage a file over 1 MB without an explicit override
- [ ] `grep -rE 'supabase|eyJhbGciOi|sb_secret' app/dist/assets/` returns nothing

## Infrastructure
- [ ] `curl -I https://<domain>/` shows `Strict-Transport-Security`, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`
- [ ] `curl -I https://<domain>/` shows `Content-Security-Policy` (**not** `-Report-Only`)
- [ ] `curl -I https://<domain>/` does not disclose a server version
- [ ] `curl -H "Origin: https://evil.example" https://<domain>/api/companies -I` returns no `Access-Control-Allow-Origin`
- [ ] `curl -H "X-Forwarded-For: 1.2.3.4" …` repeated past the limit still returns 429 (spoofing does not reset the counter)
- [ ] Rate limits survive a PM2 restart (Redis configured)

## Authentication & authorization
- [ ] Password shorter than 12 characters is rejected on user create/update
- [ ] `password123` is rejected by the common-password check
- [ ] `PATCH /api/auth/password` exists and requires the current password
- [ ] A failed login writes an audit record; a successful login writes an audit record
- [ ] A PROVIDER token against any `/api/admin/*` route returns 403
- [ ] A PROVIDER cannot read another company's conversation (`GET /api/provider/chat/<other-company-thread>` → 403)
- [ ] A PROVIDER cannot PATCH another company's lead (`PATCH /api/leads/<other-id>` → 403)
- [ ] A body-supplied `companyId`/`role`/`userId` changes nothing on any provider route
- [ ] Setting `isActive=false` causes that user's existing token to 401 on the next request

## API robustness
- [ ] A 1 MB JSON body to `/api/admin/companies/[id]` returns 413
- [ ] A 1 MB JSON body to `/api/provider/change-requests` returns 413
- [ ] `POST /api/push/subscribe` with `endpoint: "http://127.0.0.1:3000/"` returns 400
- [ ] `POST /api/push/subscribe` with `endpoint: "http://169.254.169.254/"` returns 400
- [ ] A change request with `{"yearsExperience": "abc"}` is rejected at **submit**, not at approve
- [ ] A change request with a 10,000-entry `gallery` is rejected at submit
- [ ] The 21st upload in an hour from one provider returns 429
- [ ] `?page=99999999999999999999` returns an empty page, not a 500
- [ ] A NUL byte in `?search=` returns 200, not a 500

## Data & database
- [ ] `SELECT count(*) FROM "Lead" WHERE "trackingToken" IS NULL` returns 0
- [ ] The phone-tail fallback branch in `leadSecretMatches` is deleted
- [ ] Supabase security advisors show no WARN-level lints
- [ ] `rls_auto_enable` is not executable by `anon` or `authenticated`
- [ ] Every table in `public` still has `rowsecurity = true`
- [ ] The abandoned Supabase project is deleted, or its `public` tables are dropped

## Client
- [ ] `app/dist` contains zero `.map` files
- [ ] No `dangerouslySetInnerHTML` anywhere in `app/src`
- [ ] `VITE_API_URL` is set in the production build (no demo-mode warning in the console)
- [ ] The login response body contains no `token` field

---

# 23. Coverage

| # | Category | Status | Note |
|---|---|---|---|
| 0 | Project discovery | **PASS** | Full architecture mapped |
| 1 | Attack surface inventory | **PASS** | 101 route handlers, all frontend routes, all integrations |
| 2 | Authentication security | **PASS** | §9 — full matrix |
| 3 | Authorization / access control | **PASS** | §10 — all six questions answered per endpoint class |
| 4 | Supabase security | **PASS** | §12 — verified against the live project, read-only |
| 5 | API security (OWASP API Top 10) | **PASS** | §11 |
| 6 | Input validation | **PASS** | One gap found (M-03) |
| 7 | Injection (SQL/NoSQL/command/code/template) | **PASS** | Both `$queryRaw` uses parameterized; no `eval`/`Function`/`child_process` in server code |
| 8 | XSS | **PASS** | §14 — zero sinks found |
| 9 | CSRF | **PASS** | §15 — structural via `SameSite=Strict` |
| 10 | SSRF | **PASS** | One finding (M-02) |
| 11 | File upload security | **PASS** | Byte-level type validation verified |
| 12 | Path traversal | **PASS** | No user input reaches a filesystem path; upload names are server-generated UUIDs |
| 13 | Business logic | **PASS** | §19 |
| 14 | Race conditions | **PASS** | Transactional claims + unique constraints verified |
| 15 | Rate limiting / abuse | **PASS** | Two findings (M-05, M-08) |
| 16 | Security headers | **PARTIAL** | Configuration reviewed; **live responses not observed — verify with `curl -I`** |
| 17 | CORS | **PASS** | Deny-by-default-in-production verified, with a unit test backing it |
| 18 | Security misconfiguration | **PASS** | No debug endpoints, no verbose errors, no directory listing, no default credentials |
| 19 | Secrets audit | **PARTIAL** | Current tree and `.git/index` covered; **full commit-history enumeration blocked — `git` unavailable in this shell** |
| 20 | Dependency / supply chain | **PARTIAL** | Static lockfile analysis complete; **`npm audit` could not run — npm unavailable in this shell** |
| 21 | Next.js specific | **PASS** | Proxy, route handlers, `NEXT_PUBLIC_*`, headers, env loading (including the `.env.production` auto-load trap) all reviewed |
| 22 | Client-side security | **PASS** | §14 — bundle grepped, storage inventoried |
| 23 | Admin dashboard | **PASS** | §15 |
| 24 | Database security | **PASS** | §13 — live catalog introspected |
| 25 | Logging / monitoring | **PASS** | One finding (M-06); confirmed no secrets in logs |
| 26 | Error handling | **PASS** | `withErrors` verified; generic 500s, no stack traces to clients |
| 27 | HTTP / proxy security | **PARTIAL** | Caddyfile reviewed; **live TLS and header behaviour not observed** |
| 28 | DNS / domain security | **MANUAL VERIFICATION REQUIRED** | Not performed — audit rules prohibit contacting third-party systems |
| 29 | Git / CI-CD security | **PASS** | Found the critical issue here |
| 30 | Privacy / data exposure | **PASS** | Serializer separation verified field by field |
| 31 | Security testing tools | **PARTIAL** | Supabase advisors + ripgrep + lockfile analysis used; npm/git/gitleaks unavailable in this shell |
| 32 | Source code review | **PASS** | All authentication, middleware, guards, services, validation schemas and admin/provider routes read |
| 33 | Finding classification | **PASS** | Severity + confidence on every finding |
| 34 | Impact analysis | **PASS** | Full structure on Critical/High; condensed on Low/Info |
| 35 | False-positive control | **PASS** | See below |
| 36 | Security score | **PASS** | §2 |

**Coverage: 30 PASS · 5 PARTIAL · 1 MANUAL · 0 FAIL — approximately 92% fully verified.**

## What could not be verified

1. **Live HTTP response headers and TLS configuration** — no network access to the production host. `deploy/Caddyfile` was reviewed as source. Confirm with `curl -I https://<your-domain>/`.
2. **Full git commit history** — `git` is not on this shell's PATH. I confirmed the tarball is tracked by parsing `.git/index` directly, but could not enumerate historical commits for other secrets. Run `gitleaks detect --source . --log-opts="--all"`.
3. **`npm audit` against the live advisory database** — `npm` is not on this shell's PATH. Dependency analysis was done statically from both lockfiles.
4. **Server runtime configuration** — the deployed `api/.env`, the installed `/etc/caddy/Caddyfile`, firewall rules, SSH hardening and fail2ban are outside the repository. In particular, confirm `RATE_LIMIT_ALLOW_INMEMORY`, `CORS_ALLOWED_ORIGINS` and `VITE_API_URL` on the server.
5. **DNS, SPF, DKIM, DMARC** — deliberately not tested, per the audit rules.
6. **Whether the abandoned Supabase project is still the live Storage backend** — the evidence points both ways (440 objects and a CSP allowing `*.supabase.co` suggest yes; a 16-migration gap suggests the database moved). This determines whether H-01 is "decommission it" or "it is production and was treated as abandoned", and only you can answer it.
7. **Repository visibility (public vs private)** — this scales C-01's blast radius. If the repository is or ever was public, treat every secret as fully compromised and check GitHub's secret-scanning alerts.

## False-positive control

Before including each finding I checked for compensating controls — middleware, server-side authorization, RLS, validation, rate limiting, security headers. Specifically **excluded** as already-mitigated or non-issues:

* *"No RLS policies on any table"* — the Supabase advisor's 13 INFO lints. RLS **is** enabled with deny-all semantics, which is correct for an application that enforces authorization in its own layer and connects as a `BYPASSRLS` role. Not a finding.
* *"Service-role key in a `NEXT_PUBLIC_`-prefixed environment"* — checked; only the URL and anon key carry the prefix, and neither reaches the client bundle.
* *"XSS in company descriptions / reviews / chat"* — server-side `stripHtml` plus React escaping plus a link-free Markdown renderer. No sink exists.
* *"SQL injection in `$queryRaw`"* — both call sites are parameterized tagged templates, and `stats.service`'s `unit` is a closed union type.
* *"CSRF on state-changing routes"* — `SameSite=Strict` is a complete structural defence for a same-origin deployment.
* *"Rate-limit bypass via `X-Forwarded-For`"* — the limiter reads from the right, and Caddy overwrites the header from the real peer.
* *"Public `/api/chat` endpoint"* — gated by `refNumber` + `trackingToken` with constant-time comparison.
* *"`PATCH /api/leads/[id]` allows cross-company updates"* — `getOwnerCompanyId` + `assertOwnership`.
* *"Supabase leaked-password protection disabled"* — the app does not use Supabase Auth. Recorded as I-04, Not Applicable.
* *"`rls_auto_enable` RPC callable by anon"* — it returns `event_trigger` and cannot be invoked directly. Downgraded from the advisor's WARN to LOW (L-09), for the unnecessary grant only.

---

*Audit performed under the constraints stated at the top of this document: static analysis, configuration review, and read-only introspection only. No application code, configuration, environment variable, database record or production resource was modified. No destructive, denial-of-service, brute-force or third-party exploitation was performed.*
