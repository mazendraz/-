# Title
Security hardening + marketplace features (CTO review phases 1–5)

# Body
Implements the fixes and features from the CTO review, across five phases. Every external integration degrades gracefully (no behavior change until the relevant env var is set).

## Phase 1 — Security quick wins
- **Rate-limit spoof fix:** `clientIp` reads the rightmost trusted `X-Forwarded-For` hop (`TRUSTED_PROXY_HOPS`), not the spoofable leftmost — restores login/lead/review throttling behind Caddy.
- Caddy re-sets `X-Forwarded-For` from the real peer.
- Default `JWT_TTL` lowered to `1d`; documented session revocation via `isActive`.

## Phase 2 — Provider/admin accounts
- Admin users API: `GET/POST /admin/users`, `PATCH/DELETE /admin/users/[id]`, with a **last-active-admin guard** (can't delete/demote/deactivate the only admin).
- **Team tab** in the admin dashboard (create, reset password, relink company, deactivate) + per-company "create login" shortcut.

## Phase 3 — Customer self-service
- Fixed the general-inquiry dead path (guides to pick a company when the API is live, instead of a guaranteed 404 submit).
- Public `GET /leads/track?ref=&phone=` so **My Requests shows live status** across devices (gated by ref + phone; 404 for both bad ref and mismatch — no enumeration).

## Phase 4 — Verified reviews ⚠️ (has a DB migration)
- Schema: `Review.verified` + `Lead.reviewedAt` (migration `20260625120000_verified_reviews`).
- Public `POST /reviews` for completed leads (ref + phone, one-time per lead, author/company taken from the lead so it can't be spoofed).
- "Verified" badge + a review prompt in My Requests; `completedProjects` labelled as self-reported.

## Phase 5 — Production hardening (all no-op until configured)
- Async rate limiter with optional **Upstash Redis** backend + in-memory fallback.
- **Sentry** error reporting via the HTTP envelope API (no SDK), wired into `withErrors`.
- **CAPTCHA** (Turnstile/reCAPTCHA) verification on public submits.

## Verification
- `api`: `tsc --noEmit` clean, `vitest` **97/97** pass, `prisma generate` ok
- `app`: `tsc --noEmit` clean, `npm run build` ok

## Deploy notes
- Run `npx prisma migrate deploy` before this goes live (Phase 4 migration). Existing rows default to `verified=false` / `reviewedAt=null`.
- New optional env (all documented in `api/.env.example`): `TRUSTED_PROXY_HOPS`, `UPSTASH_REDIS_REST_URL`/`_TOKEN`, `SENTRY_DSN`, `TURNSTILE_SECRET_KEY`/`RECAPTCHA_SECRET_KEY`.

## Caveats (need real keys + live testing — not validated locally)
- Upstash Redis round-trip, Sentry event delivery, and CAPTCHA each work only against real services.
- **Enabling a CAPTCHA secret requires the frontend widget + token field** (deliberate follow-up; needs a site key) or submits will be rejected.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
