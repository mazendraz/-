# Phase 2 — Foundation & authentication

> Part of the [Business App build plan](README.md). Read that first.

**Depends on:** phase 0 (B1), phase 1 · **Unblocks:** every feature phase
**Backend change:** none · **Roles:** both

---

## Objective

A staff member signs in on a phone, stays signed in across restarts, and lands in
the tab bar for their role.

## Scope

**In:** project scaffold, shared-package wiring, RTL, fonts, session store,
permissions helper, sign-in screen, root layout with all three gates, role-branched
route groups, sign-out.

**Out:** every feature screen. This phase ends with two empty tab groups.

---

## Project setup

Scaffold `mobile/business/` at the client app's **exact** SDK versions —
divergence means two Metro configs, two Hermes behaviours, and bugs that
reproduce in one app only.

> **Never `npm install <pkg>` by name in this repo.** Copy dependency versions
> from `mobile/client/package.json` by hand, then run a bare `npm install`.
> Installing by name silently downgrades Expo packages.

Copy from `mobile/client`: `metro.config.js`, `babel.config.js`, `tsconfig.json`,
`index.ts` (**including the `@formatjs/intl-pluralrules` polyfill entry point** —
without it `@alassema/core`'s `plural.ts` crashes the whole app on native),
`scripts/sync-lan-ip.js`.

### `app.json`

| Key | Value |
|-----|-------|
| `name` | `Al Assema Business` |
| `slug` | `alassema-business` |
| `scheme` | `alassemabiz` — **distinct** from the client's `alassema` |
| `ios.bundleIdentifier` / `android.package` | `com.alassema.business` |
| `userInterfaceStyle` | `light` |
| `runtimeVersion.policy` | `appVersion` |
| plugins | `expo-router`, `expo-secure-store`, `expo-splash-screen`, `expo-font`, `expo-notifications` (colour `#005578`) |

**Not** needed: `expo-apple-authentication`, `expo-auth-session`, `expo-web-browser`,
Turnstile. Staff sign in with a password only.

### Environment

`.env.example` with exactly three keys:

```
EXPO_PUBLIC_API_URL=""     # must end in /api/v1 — not /api
EXPO_PUBLIC_ASSET_URL=""
EXPO_PUBLIC_API_KEY=""     # optional X-Api-Key gate; unset today
```

---

## Modules

### `lib/config.ts`

Instantiate `MobileConfig` from phase 1 with the staff paths: `refreshPath:
"/auth/refresh"`, `streamPath: "/provider/stream"`, `devicePath: "/push/device"`,
`getAuthSubjectId: () => staffAuth.snapshot().user?.id ?? null`.

### `lib/staffAuth.ts`

Model directly on `mobile/client/lib/customerAuth.ts` — a module-level snapshot
plus `useSyncExternalStore`. `getSnapshot` must return the **same reference** when
nothing changed, or React re-renders forever.

```ts
interface Snapshot { user: ApiUser | null; loading: boolean }

signIn(email, password)      // POST /auth/login with { device }
signOut()                    // see the ordering rule below
bootstrapSession()           // cold start: cached user → GET /auth/me → reconcile
useStaffAuth(): Snapshot
```

Subscribe to `onAuthInvalidated` from the shared session module so a
server-killed session clears the in-memory user too. Without it the tab bar keeps
rendering the authenticated shell over a session that no longer works — the exact
bug the client app fixed.

Cache the `ApiUser` in AsyncStorage (not SecureStore — it is not a secret) so the
first frame after a cold start is already correct.

### `lib/permissions.ts`

Presentation only. `isAdmin`, `isProvider`, `canCompleteLeads`, `canModerate`,
`canManageTeam`, `hasDesktopPermission(p)`. Never the sole gate on an action.

---

## Screens

| Screen | Purpose | APIs |
|--------|---------|------|
| `sign-in` | Email + password. The only entry point — no social sign-in, no self-registration. | `POST /auth/login` |
| `_layout` (root) | RTL → fonts → session bootstrap → **update gate → offline gate** → `ErrorBoundary`. | `GET /app-version`, `GET /ready`, `GET /auth/me` |
| `(provider)/_layout` | 4-tab bar: Overview · Leads · Messages · More | — |
| `(admin)/_layout` | 5-tab bar: Overview · Leads · Approvals · Messages · More | — |

**Three gates, not four — no blocking maintenance screen.** Confirmed against
`api/src/lib/middleware/maintenance.ts`'s own comment: *"Anything under admin/
or provider/ — those dashboards stay usable during maintenance (that is the
point of taking the public site down)."* `withMaintenance` is applied only to
public write endpoints; every `/provider/*` and `/admin/*` route this app
calls is unaffected. Blocking staff out during maintenance would be a real
lockout bug — the admin who needs to turn maintenance back off (phase 11)
would be the one person the gate stops. A build below `minimum` still blocks
**even if** the site is otherwise up — that lever is about a broken client
build, not the server's maintenance flag, so it stays. Maintenance state
becomes an informational banner in phase 11 instead (`MaintenanceBanner`),
not a full-screen replace.

Export `ErrorBoundary` from the root layout — expo-router's own crash net. Without
it an unhandled render error is a permanent blank screen.

---

## Auth flow

```
cold start → getAccessToken()
   ├─ none      → sign-in
   └─ present   → GET /auth/me
                    ├─ 200 → store ApiUser, mount the role's tab group
                    └─ 401 → POST /auth/refresh (single-flight)
                               ├─ ok   → save rotated pair, retry once
                               └─ fail → invalidateSession() → sign-in

any 401 (except on the refresh route) → one refresh → one retry → else sign out

sign-out:  DELETE /push/device  →  POST /auth/logout  →  clearTokens()  →  sign-in
```

> **Two ordering rules the client app learned the hard way.** Unregister the push
> device **before** clearing the token, or the call has no credential. And route
> the SSE reconnect through the **same** single-flight refresh as ordinary
> requests — otherwise an expired token means every reconnect 401s into backoff
> forever while interval polling silently covers for it.

---

## Tasks

| # | Task |
|---|------|
| 2.1 | Scaffold `mobile/business`; copy dependency versions by hand; bare `npm install`. |
| 2.2 | Copy `metro.config.js`, `babel.config.js`, `tsconfig.json`, `index.ts` (with the polyfill), `scripts/sync-lan-ip.js`. |
| 2.3 | Write `app.json` per the table above. |
| 2.4 | Write `.env.example`; wire `sync-lan-ip` into the `prestart` scripts. |
| 2.5 | Write `lib/config.ts` and call `configure()` from the entry point. |
| 2.6 | Write `lib/staffAuth.ts` with the snapshot store, `signIn`, `signOut`, `bootstrapSession`, `useStaffAuth`. |
| 2.7 | Write `lib/permissions.ts`. |
| 2.8 | Build the sign-in screen: field validation, 401 copy, 429 retry copy, in-flight submit lock. |
| 2.9 | Build the root layout with all three gates, **every gate fetch timeout-bounded**. |
| 2.10 | Build both tab-group layouts; redirect a stale cross-role deep link to the correct overview. |
| 2.11 | Wire sign-out in the documented order. |
| 2.12 | Add a `typecheck` script; confirm `tsc --noEmit` is clean. |

## Tests

Unit: token storage round-trip; single-flight refresh under three concurrent
401s; role → route-group selection; the timeout wrapper resolves as a network
failure rather than an abort.

Manual, on a device: cold start with no token, with a valid token, with an
expired access token, with a revoked session, and as a deactivated account. Wrong
password. Rate-limit copy. Force-quit and relaunch.

## Definition of done

- [ ] A provider and an admin each sign in and land in the correct tab group.
- [ ] The session restores after a force-quit with no flash of the signed-out shell.
- [ ] An expired access token refreshes silently; a dead refresh token signs out cleanly.
- [ ] Sign-out unregisters the device, revokes the server session, clears SecureStore.
- [ ] `tsc --noEmit` clean.

## Risks & edge cases

| Risk | Handling |
|------|----------|
| **Splash held forever on a hung request** | The client app's whole-app white screen came from exactly this. Every gate fetch must be timeout-bounded; the shared `api.ts` already wraps requests at 12s and `probeReady` at 5s. |
| A provider with no `companyId` | Legal state. `/provider/leads` returns an empty page, `/provider/stats` returns 400. Do not crash — phase 3 renders an explanatory state. |
| RTL applied too late | `ensureRTL()` runs at module scope **before** the first screen mounts, not in an effect. Copy the client app's `rtl.ts` usage exactly. |
| `getSnapshot` returning a fresh object each call | Infinite re-render. Keep a stable reference and only replace it on real change. |
