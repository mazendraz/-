# Phase 0 — Backend: staff sessions

> Part of the [Business App build plan](README.md). Read that first.

**Depends on:** nothing · **Unblocks:** phase 2, and therefore everything
**Backend change:** B1 · **Migration:** yes — one new table · **Roles:** both

---

## Objective

Give staff a session that survives longer than a day and can be revoked per
device, without lengthening the web dashboard's session or weakening revocation.

## The problem, from the code

`api/src/lib/auth.ts:26`:

```ts
const TOKEN_TTL = process.env.JWT_TTL ?? "1d";
```

- `api/.env.example` sets `JWT_TTL="1d"`.
- `GET /auth/me` returns the user and **does not re-issue** — unlike
  `/customer/me`, which renews the cookie on every call. Staff sessions expire
  flat.
- There is no staff refresh token and no per-device revocation. The only levers
  are account-wide: `User.isActive` and `User.tokensValidFrom`.

A forced daily re-login is not shippable, and "sign out my lost phone" currently
means deactivating the whole account.

### Why not just raise `JWT_TTL`

It is a **global** constant. Raising it to 30 days also lengthens the web
dashboard's httpOnly cookie, and produces a 30-day bearer credential for an
account that can delete leads and deactivate users — revocable only by disabling
the entire account. The right model already exists one table over.

## Scope

**In:** `StaffSession` model, service, refresh route, `sid` claim, logout
revocation, session list/revoke routes.

**Out:** any change to `JWT_TTL`, to the web login flow, or to the customer
session path. All three stay exactly as they are.

---

## Backend changes

### Model — `api/prisma/schema.prisma`

Mirror `CustomerSession` (same file, ~line 1191). Read its comments before
writing this; they explain the rotation grace window and why the hash is sha256
rather than bcrypt.

```prisma
model StaffSession {
  id     String @id @default(uuid())
  userId String

  tokenHash String @unique

  previousTokenHash String?   @unique
  previousUsableTo  DateTime?

  deviceName String?
  platform   String? // "ios" | "android"

  lastUsedAt DateTime  @default(now())
  expiresAt  DateTime
  revokedAt  DateTime?
  createdAt  DateTime  @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([expiresAt])
}
```

Add the back-relation on `User`. `STAFF_REFRESH_TTL_MS = 30 days` — half the
customer's 60, because a staff credential carries more authority and staff
turnover is a real revocation event.

### Service — `api/src/lib/services/staffSession.service.ts` (new)

Port the semantics of `customerSession.service.ts`; do not re-derive them.

- `create(userId, device)` → `{ sessionId, refreshToken }`
- `refresh(token, ip)` → rotate, retire the old hash, set `previousUsableTo` to
  now + 60s. A token presented **within** the grace window returns the current
  token again (idempotent retry over a dropped mobile response). Presented
  **after** it, the only explanation left is a copy someone else kept — revoke
  the session.
- `revoke(sessionId)`, `revokeAll(userId)`, `list(userId)`, `sweepExpired()`

### Token — `api/src/lib/auth.ts`

- Add optional `sid` to `TokenClaims`; emit it in `signToken` when present,
  exactly as `signCustomerToken` already does.
- In `getAuthUser`, add the per-session liveness check **guarded by
  `if (claims.sid)`**, mirroring `getCustomerUser`'s block: dead if the row is
  missing, belongs to another user, is revoked, or has expired.

### Routes

| Method | Route | Change |
|--------|-------|--------|
| POST | `/auth/login` | Accept an optional `device` object. Present → create a session, include `refreshToken` in the response. Absent → **today's exact response**. |
| POST | `/auth/refresh` | New. Outside `withAuth` — the point is to be reachable with an expired access token. Rate-limited per IP, generously (a carrier NAT puts many users on one address). |
| POST | `/auth/logout` | Revoke the session row when the presented token carries `sid`. |
| GET | `/auth/sessions` | New. List this account's sessions for the app's devices screen. |
| DELETE | `/auth/sessions` | New. Revoke one (`{sessionId}`) or all. |

---

## Backward compatibility

This is the whole safety argument, so state it explicitly in the PR:

- The website posts no `device` field → no session row → no `sid` claim → the new
  check in `getAuthUser` is **skipped entirely**. Web behaviour is byte-identical.
- This is precisely how the customer side already handles the same split: a
  website customer token has no `sid` and is governed by the account floor; a
  mobile one has one.
- `signToken` gains an optional field. Every existing caller passes nothing.
- Additive migration: one new table, no column changes, no backfill.

---

## Tasks

| # | Task |
|---|------|
| 0.1 | Start the local DB and **confirm `DATABASE_URL` is `localhost:5433`** before any other command. |
| 0.2 | Add `StaffSession` to `schema.prisma` + the `User` back-relation. |
| 0.3 | `prisma migrate dev --name staff_sessions` — local only. Restart `dev:api` after. |
| 0.4 | Write `staffSession.service.ts`: `create`, `refresh`, `revoke`, `revokeAll`, `list`, `sweepExpired`. |
| 0.5 | Add `STAFF_REFRESH_TTL_MS` with a comment on why it is 30 days, not 60. |
| 0.6 | Extend `TokenClaims` with optional `sid`; emit in `signToken`. |
| 0.7 | Add the `sid` liveness check to `getAuthUser`, guarded on the claim's presence. |
| 0.8 | `POST /auth/login`: optional `device`, conditional `refreshToken` in the response. |
| 0.9 | `POST /auth/refresh` with its own per-IP rate limit. |
| 0.10 | Revoke on `POST /auth/logout` when `sid` is present. |
| 0.11 | `GET` and `DELETE /auth/sessions`. |
| 0.12 | Reuse the existing sweep job (or add one) for expired staff rows. |
| 0.13 | Tests — see below. |

## Tests

Unit (`api/vitest`):

- Rotation issues a new token and retires the old one.
- A retry **inside** the 60s grace window returns the current token (idempotent).
- The same token **after** the grace window revokes the session.
- An expired session cannot refresh.
- A revoked `sid` makes a still-unexpired access token 401 on the next request.
- `tokensValidFrom` and `isActive` still kill a session with a live `sid`.
- **Regression:** a login with no `device` produces no session row and the
  response shape is unchanged.

Integration: sign in with a device → call an authed route → revoke that session →
the same access token now 401s.

## Definition of done

- [ ] A device login returns `{ token, refreshToken, user }`.
- [ ] `POST /auth/refresh` rotates and returns a new pair.
- [ ] Revoking a session 401s its access token on the **next** request, not at expiry.
- [ ] A no-device login is byte-identical to today.
- [ ] The full existing `npm test` and `npm run lint` suites pass unchanged.

## Risks & edge cases

| Risk | Handling |
|------|----------|
| `getAuthUser` is on the path of **every** authenticated request in the system | The `sid` block must be inside `if (claims.sid)`. A regression here 401s every admin, provider and desktop-app user at once. |
| Clock skew around the grace window | Compare server-side only; never trust a client timestamp. |
| Refresh storms behind carrier NAT | Generous per-IP cap, matching the customer refresh route's reasoning (60/min). |
| Rotation race across two app instances | The grace window covers it. Do not shorten it below 60s. |
| Migration run against production | The `CLAUDE.md` rule exists because this already happened once. Verify `DATABASE_URL` by eye before every command. |
