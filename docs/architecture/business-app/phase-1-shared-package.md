# Phase 1 — Shared package extraction

> Part of the [Business App build plan](README.md). Read that first.

**Depends on:** nothing (parallel with phase 0) · **Unblocks:** phase 2
**Backend change:** none · **Roles:** —

---

## Objective

One implementation of the mobile infrastructure — HTTP client, token storage,
SSE, push, version gate — consumed by both apps, so a fix lands once.

> **This is the only phase in the plan that touches a deployed, customer-facing
> app.** Everything below is constrained by that.

## Scope

**In:** move seven modules out of `mobile/client/lib/` into a new workspace
package, parameterise the three customer-specific couplings, repoint the client
app's imports, verify no behaviour changed.

**Out:** UI components (see "Why not components"), any behaviour edit, any new
feature. If you find a bug while moving a file, note it and fix it in a
*separate* commit afterwards.

---

## Why these seven, and why not components

The seven modules encode hard-won behaviour that is **identical** for both apps
and expensive to get wrong twice — single-flight refresh, the SSE generation
counter, the iOS `inactive`-vs-`background` distinction, the 401→refresh→retry
path inside the stream, the web-platform guards. A bug fixed in one copy and not
the other surfaces as "live updates stopped working", which is the class of bug
that hides for weeks.

Components are the opposite. The client app's UI is a consumer browsing surface —
galleries, offering pickers, review marquees. The business app's is a dense
operational one — filterable rows, status sheets, bulk actions, forms. They share
*tokens*, not markup. Sharing components now means a props explosion serving two
callers with different needs.

### Fallback if the risk is unacceptable

Fork the seven modules into `mobile/business/lib/` and accept drift. Costs ~900
lines of duplication and a standing obligation to port fixes both ways. Take it
only if the client app must not be touched at all this cycle. **Decide before
starting phase 2** — this determines the import graph of every file in the new app.

---

## The package

`packages/mobile-shared/` — same source-entry convention as `packages/core`
(`"main": "./src/index.ts"`, no build step, picked up by the root
`workspaces: ["packages/*", "mobile/*"]`).

### Modules to move, from `mobile/client/lib/`

| Module | Coupling to break |
|--------|-------------------|
| `session.ts` | none — moves verbatim, including the web `sessionStorage` fallback and its warning comment |
| `api.ts` | hardcoded `/auth/customer/refresh` → `config.refreshPath` |
| `liveEvents.ts` | `useCustomerAuth` → `config.getAuthSubjectId`; `/customer/stream` → `config.streamPath` |
| `push.ts` | `/customer/push-device` → `config.devicePath`; `useCustomerAuth` → injected subject |
| `appVersion.ts` | none (gains `?app=` in phase 4) |
| `rtl.ts` | none |
| `fonts.ts` | none |

### Config injection

```ts
export interface MobileConfig {
  baseUrl: string;
  apiKey: string;
  refreshPath: string;   // client: /auth/customer/refresh · business: /auth/refresh
  streamPath: string;    // client: /customer/stream       · business: /provider/stream
  devicePath: string;    // client: /customer/push-device  · business: /push/device
  getAuthSubjectId: () => string | null;  // the signed-in subject, or null
}
```

One `configure(config)` call at app start, before any module is used. Keep the
existing module-level singletons — the SSE connection in particular **must** stay
a singleton, for the reason `liveEvents.ts`'s own comment gives.

---

## Tasks

| # | Task |
|---|------|
| 1.1 | Create `packages/mobile-shared` — `package.json`, `tsconfig.json`, `src/index.ts`. |
| 1.2 | Define `MobileConfig` and `configure()`. |
| 1.3 | Move `session.ts` verbatim. |
| 1.4 | Move `api.ts`; replace the refresh path with `config.refreshPath`. |
| 1.5 | Move `liveEvents.ts`; replace the auth hook and stream path with config. |
| 1.6 | Move `push.ts`; parameterise the device path. **Keep every `Platform.OS === "web"` guard** — `useLastNotificationResponse()` throws synchronously on web. |
| 1.7 | Move `appVersion.ts`, `rtl.ts`, `fonts.ts`. |
| 1.8 | Add `@alassema/mobile-shared` to the client's `package.json` by hand; bare `npm install`. |
| 1.9 | Repoint the client app's imports; call `configure()` from its entry point; delete the moved files. |
| 1.10 | Verify (below), then ship alone: `npm run ship -- "mobile: extract shared infrastructure package"`. |

## Tests

This phase has no new features to test — the whole test is *nothing changed*.

- `tsc --noEmit` in `packages/mobile-shared`, `mobile/client`, and `packages/core`.
- `npm run bundle:check` in `mobile/client` (`expo export --platform web`).
- The existing Playwright render sweep against a mocked API.
- **A physical-device smoke test of the client app**: sign in, open a chat,
  receive a live message over SSE, receive a push, force-quit and relaunch to
  confirm the session restores.

> The device test is not optional. Chromium has APIs the device does not — this
> app already shipped an `Intl.PluralRules` crash that took down every screen and
> was invisible to every web check.

## Definition of done

- [ ] The client app imports all seven modules from `@alassema/mobile-shared`.
- [ ] No file in `mobile/client/lib/` duplicates a moved module.
- [ ] Every verification step above passes.
- [ ] Shipped as its own commit, with no business-app work bundled into it.

## Risks & edge cases

| Risk | Handling |
|------|----------|
| A behaviour change slips in during the move | Pure move + import path only. Diff each moved file against its original and confirm the only changes are the parameterised lines. |
| Metro fails to resolve a new workspace package | `mobile/client/metro.config.js` already handles the `@alassema/core` workspace case — extend the same watch-folder/resolver config, do not invent a new one. |
| The singleton SSE connection becomes per-app-instance | Keep module scope. The client app previously held 2–4 connections per account; the server caps at 8 per channel. |
| Circular import between `api.ts` and the auth store | Already solved: `session.ts` owns the `onAuthInvalidated` pub/sub precisely because both sides import it. Preserve that shape. |
