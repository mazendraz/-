# Business App — Provider & Admin Mobile Application

> Execution plan for `mobile/business/`, a single Expo app serving both staff
> roles. **One file per phase.** This file is the shared context — read it
> before any phase file, and read [`CLAUDE.md`](../../../CLAUDE.md) before any
> command, especially the local-vs-production database rule.
>
> Derived from an audit of the repository on **2026-08-31**. The code is the
> source of truth. [`../mobile-apps-plan.md`](../mobile-apps-plan.md) is the
> earlier plan and is **outdated** — see "Superseded assumptions" below.

---

## 1. What this builds

A production Expo app for `PROVIDER` and `ADMIN` staff, covering the **complete**
provider and admin feature surface — not an MVP subset. It consumes the existing
`api/` backend over `/api/v1` with a Bearer token. It introduces no new backend
system: 27 provider routes, 68 admin routes, native push and a staff SSE endpoint
already exist and already work.

Scope decisions that are locked (do not re-litigate without asking Mazen):

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | **One app, role-based navigation** — not two binaries | The backend already treats staff as one population: one `User` table, one `typ:"staff"` token audience, one `/provider/stream`, one `/push/device`. Two apps means two store listings, two credential sets, two release trains to separate ~12 screens that share all their infrastructure. |
| 2 | **SSE stays. No Supabase Realtime.** | `api/src/lib/services/realtime.service.ts` documents the rejection: RLS on three tables plus a publishable key on every client, none of it exercisable on the plain-Postgres dev DB. |
| 3 | **Staff refresh sessions, not a longer `JWT_TTL`** | `JWT_TTL` is global — raising it also lengthens the web dashboard cookie and produces a 30-day bearer token for an account that can delete leads. `CustomerSession` is the model to mirror. See [phase-0](phase-0-backend-sessions.md). |
| 4 | **Arabic only, RTL forced** | Matches `mobile/client`. The website's string table is 1000+ keys; i18n is a separate project if ever wanted. |
| 5 | **Control Center modules are read-mostly on mobile** | The Tauri app in [`desktop/`](../../../desktop/) already covers all 19 `desktopOnly` routes across 20+ screens. Mobile adds field access, not a second ledger. See [phase-12](phase-12-control-center.md). |
| 6 | **Client app behaviour must not change** | It is deployed and customer-facing. Only [phase-1](phase-1-shared-package.md) touches it, and only as a behaviour-preserving move. |

---

## 2. Phase index

| # | Phase | Depends on | Backend | Roles |
|---|-------|-----------|---------|-------|
| 0 | [Backend — staff sessions](phase-0-backend-sessions.md) | — | **B1** | both |
| 1 | [Shared package extraction](phase-1-shared-package.md) | — | — | — |
| 2 | [Foundation & authentication](phase-2-foundation-auth.md) | 0, 1 | — | both |
| 3 | [Provider — leads & completion](phase-3-provider-leads.md) | 2 | — | PROVIDER |
| 4 | [Realtime & push](phase-4-realtime-push.md) | 3 | **B2–B5** | both |
| 5 | [Provider — chat](phase-5-provider-chat.md) | 4 | — | PROVIDER |
| 6 | [Provider — operations](phase-6-provider-operations.md) | 2 | — | PROVIDER |
| 7 | [Provider — catalog & pricing](phase-7-provider-catalog.md) | 6 | — | PROVIDER |
| 8 | [Admin — core](phase-8-admin-core.md) | 4 | **B6** | ADMIN |
| 9 | [Admin — moderation queue](phase-9-admin-moderation.md) | 8 | — | ADMIN |
| 10 | [Admin — companies & catalog](phase-10-admin-companies.md) | 8 | — | ADMIN |
| 11 | [Admin — platform administration](phase-11-admin-platform.md) | 8 | — | ADMIN |
| 12 | [Control Center modules](phase-12-control-center.md) | 8 | — | ADMIN + permission |
| 13 | [Hardening](phase-13-hardening.md) | 3–12 | — | both |
| 14 | [Builds & store release](phase-14-release.md) | 13 | — | — |

### Execution order

```
Phase 0  ─────────────────┐          (blocks everything)
Phase 1  ─────────────────┤          (parallel with 0 — different packages)
                          ▼
Phase 2  ──────────────────────────► foundation
                          ▼
Phase 3  ──────────────────────────► first real user value
                          ▼
Phase 4  ──────────────────────────► the reason the app exists
                          ▼
        ┌─────────────┬───────────────┬──────────────┐
        ▼             ▼               ▼              ▼
    Phase 5       Phase 6 → 7      Phase 8      (8 needs B6)
    chat          provider ops       admin core
                                        ▼
                          ┌─────────────┼─────────────┬──────────┐
                          ▼             ▼             ▼          ▼
                      Phase 9      Phase 10      Phase 11   Phase 12
                      moderation   companies     platform   control centre
                          └─────────────┴─────────────┴──────────┘
                                        ▼
                                    Phase 13 ──► Phase 14
```

Phases 5, 6→7 and 8 are genuinely parallel once 4 lands. Phases 9–12 are
parallel once 8 lands and share its components.

---

## 3. Backend changes, in one place

All six are **additive**. Each is evaluated against one question first: *can the
deployed client app or the website notice?* For all six, the answer is no.

| ID | Change | Migration | Phase | Detail |
|----|--------|-----------|-------|--------|
| **B1** | `StaffSession` model, `POST /auth/refresh`, `sid` claim, session routes | yes — new table | 0 | [phase-0](phase-0-backend-sessions.md) |
| **B2** | Push deep-link mapping (device-side, no server change) | no | 4 | [phase-4](phase-4-realtime-push.md) |
| **B3** | Per-user SSE cap on the `admins` channel | no | 4 | [phase-4](phase-4-realtime-push.md) |
| **B4** | Publish `lead-status` to company + admin channels | no | 4 | [phase-4](phase-4-realtime-push.md) |
| **B5** | Per-app `/app-version` via `?app=` | no | 4 | [phase-4](phase-4-realtime-push.md) |
| **B6** | `GET /admin/leads/[id]` — no admin single-lead read exists | no | 8 | [phase-8](phase-8-admin-core.md) |

---

## 4. Conventions every phase follows

### Roles and guards

Read from `api/src/lib/middleware/guards.ts`:

- `authed` — any staff. `adminOnly` — `withRole("ADMIN")`. `providerOnly` — `withRole("PROVIDER")`.
- `desktopOnly(permission)` — ADMIN **and** a `User.desktopPermissions` grant.
- `assertOwnership(user, companyId)` — admins bypass; providers are limited to their own company.

> **`withRole` tests strict equality.** An `ADMIN` receives **403 on every
> `/api/provider/*` route**. There is no fallback. Admin screens are built on
> `/api/admin/*` or they do not work. This is the single most important fact in
> this plan.

`lib/permissions.ts` in the app is **presentation only** — it decides which tabs
render, never whether an action is allowed. Never add a client-side check with no
server counterpart.

### The shared screen contract

Every screen implements these unless its phase file says otherwise:

| State | Behaviour |
|-------|-----------|
| Loading | Skeleton rows matching the final layout on first load; inline top progress on refetch. Never a full-screen spinner over content already on screen. |
| Empty | Arabic copy naming the absent thing plus the one action that changes it. Never a bare `لا توجد نتائج`. |
| Error | Inline retry card, keyed on `ApiError.status`: 401 → session gate; 403 → `ليس لديك صلاحية`; 429 → server retry-after copy verbatim; 0/5xx → shared offline path. |
| Offline | `useBackendHealth` raises `OfflineScreen` above the tree; per-screen the last good payload stays rendered under a stale banner. |
| Realtime | An SSE event **invalidates and refetches**; it never carries data. Interval refetch stays wired and is *slowed* when connected, never switched off. |
| Push | Taps route through `lib/deepLinks.ts`. Foreground: banner + list, no sound, badge applied. |
| Permissions | Route-group membership (`(provider)` / `(admin)`) is the gate. A stale cross-role deep link redirects to that role's overview. |

### Error contract

Uniform `ApiErrorBody { code, message, details? }` from `withErrors`:
`VALIDATION_ERROR` (400, `details` is `Record<field, string[]>`), `UNAUTHORIZED`
(401), `FORBIDDEN` (403), `NOT_FOUND` (404), `CONFLICT` (409), `RATE_LIMIT` (429),
`MAINTENANCE` (503).

### Types

Import from `@alassema/core` — never redeclare an API shape. It already exports
`ApiLead`, `ApiPage`, `ApiLeadStats`, `ApiOffering`, `ApiCompany`, `ApiAdminUser`,
`ApiConversation`, `ApiMessage`, the finance and reporting types, plus the M3
`colors` / `type` tokens generated from `app/tailwind.config.js`.

### Rules carried from `CLAUDE.md`

- Every `prisma migrate` / seed runs against the **local** DB. Confirm
  `DATABASE_URL` is `localhost:5433` first: `docker compose -f api/docker-compose.dev.yml up -d`.
- **Restart `dev:api` after any migration** — a running server caches the old
  Prisma client and writes fail with "Unknown argument".
- Ship with `npm run ship -- "message"`. No rebase, no force-push, no new branches.
- **Never `npm install <pkg>` by name in this repo** — hand-edit `package.json`
  and run a bare `npm install`, or Expo packages silently downgrade.
- Web-only verification cannot catch native-Hermes bugs. **A physical-device
  smoke test after every ship is mandatory.**

---

## 5. Superseded assumptions

[`../mobile-apps-plan.md`](../mobile-apps-plan.md) predates the client app
shipping. It is kept for history; these parts of it are wrong:

| It says | Reality |
|---------|---------|
| `mobile-provider/` + `mobile-client/` at repo root | `mobile/client/`, under the `mobile/*` workspace glob |
| Client is guest-only, no accounts | `CustomerUser`, `CustomerSession`, Google and Apple sign-in all shipped |
| `DeviceToken` + `LeadDeviceToken` tables | One `PushDevice` table, `userId` XOR `customerId` |
| Supabase Realtime for chat | SSE, in-process pub/sub, explicitly chosen over Supabase |
| No shared package; mirror types by hand | `@alassema/core` is a live workspace member |
| Add `MOBILE_JWT_TTL` for longer mobile tokens | Superseded by B1 — the customer refresh-session model is the better precedent and already exists |
