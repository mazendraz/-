# Phase 4 — Realtime & push

> Part of the [Business App build plan](README.md). Read that first.

**Depends on:** phase 3 · **Unblocks:** phase 5, phase 8 (via B3)
**Backend changes:** B2, B3, B4, B5 · **Roles:** both

---

## Objective

A lead arriving reaches the provider's pocket while they are on site. This is the
reason the app exists.

## Scope

**In:** four backend fixes, the SSE singleton, the event router, push permission
and registration, the deep-link mapping table, tab badges.

**Out:** any new screen. This phase makes existing screens live.

---

## The existing SSE system

| Aspect | Detail |
|--------|--------|
| Hub | In-process `Map<channel, Set<listener>>` in `realtime.service.ts`. Valid because the API runs as a **single PM2 fork** — the same constraint the in-memory rate limiter carries. |
| Channels | `company:<id>`, `customer:<id>`, `admins` |
| Staff endpoint | `GET /provider/stream`, `withAuth`. Provider → company channel; ADMIN → `admins`. Channels are derived from the session, **never** from a query parameter. |
| Events | `{type:"message", leadId, conversationId}` · `{type:"lead", leadId, companyId}` · `{type:"lead-status", leadId}` |
| Keepalive | `: ping` every 25s. Non-optional — Caddy closes silent connections. |
| Cap | `MAX_STREAMS_PER_CHANNEL = 8`, checked before the stream is constructed. |

Events carry **ids, not payloads**. A subscriber is told *something changed in
your world* and refetches. That keeps authorization at the fetch, where it is
already enforced.

### Who publishes what

| Event | Published to | Site |
|-------|-------------|------|
| `lead` | `company:<id>` + `admins` | `leads.service.ts:233` |
| `message` | `company:<id>` + `admins` + `customer:<id>` when the lead has one | `chat.service.ts:364` |
| `lead-status` | **`customer:<id>` only** | `leads.service.ts:757`, `leadCompletion.service.ts:113` |

---

## Backend changes

### B3 — per-user SSE cap on the admins channel

**Problem.** `listenerCount(channel) >= 8` counts every admin's connections
*together* on the shared `admins` channel. Web dashboards already sit in that
budget. The ninth connection is refused with *"Too many open connections. Close a
tab and try again"* — advice that makes no sense on a phone.

**Change.** Track connections per authenticated user for the admin channel —
either a second map keyed by user id, or pass the user into `sseResponse` and cap
on that. The `customer:` and `company:` channels keep today's behaviour exactly;
only the admin channel's accounting changes.

**Blocks phase 8.** Do not start the admin app without it.

### B4 — `lead-status` fan-out to staff

**Problem.** Staff never receive it. A provider's phone does not update when an
admin changes a status, and a provider's second device does not see the first's
change.

**Change.** Add `channelForCompany(companyId)` and `ADMIN_CHANNEL` to the
`publishAll` call at both sites. The customer channel still receives the identical
event — nothing is removed, so the client app cannot notice.

### B5 — per-app version gate

**Problem.** `/app-version` is one global lever driven by `APP_MIN_VERSION`. Two
apps would share one kill switch.

**Change.** Accept `?app=business`, reading `APP_MIN_VERSION_BUSINESS` etc., and
**fall back to the existing env vars when the parameter is absent**. The client
app sends nothing and gets today's behaviour.

### B2 — push deep links (device-side)

**Problem.** Payload `url` values are **web dashboard paths**: `/provider?tab=messages`,
`/admin?tab=chat`. The client app's handler does `router.push(url)` with no
translation. In the business app those match no route, so every notification tap
opens the app to nowhere.

**Change — on the device, not the server.** The web dashboard and its service
worker consume the same `url`; a mapping table in the app is reversible where a
payload change is not. `lib/deepLinks.ts` maps on the query string and falls back
to the role's overview for anything unrecognised. **Never call `router.push` with
an unmapped path.**

### Also

Set `EXPO_ACCESS_TOKEN` in the production `api/.env` — optional for sending, but
it is what makes rate limits and delivery receipts attributable.

---

## Mobile SSE design

| Question | Answer |
|----------|--------|
| Global or per-screen? | **One module-level singleton**, fanned out in-process. The client app started per-component and ended up holding 2–4 connections per account against an uncapped server. Do not repeat that. |
| Start | A signed-in staff session resolves **and** `AppState === "active"`. |
| Stop | On `"background"` **only** — never on `"inactive"`. On iOS, `inactive` fires for a Control Centre pull, an app-switcher peek and an incoming-call banner; tearing down there costs up to 30s of backoff for a two-second glance. |
| Reconnect | Capped exponential backoff 1→2→4→8→16→30s; reset to zero on a landed connection and on foregrounding. |
| 401 | Refresh once through the **shared single-flight** function, then retry the stream. Without this, an expired token means permanent silent backoff. |
| Duplicates | Harmless by construction — events carry ids and every handler refetches. Debounce bursts per `leadId`. |
| Fallback | Interval refetch stays wired, **slowed** when connected, never switched off. |

### Event → action

| Event | Provider | Admin |
|-------|----------|-------|
| `lead` | Refetch list + stats; badge the Leads tab if unfocused | Same, platform-wide |
| `message` | If it matches the open chat → delta fetch `?after=`; else refetch threads, badge Messages | Same |
| `lead-status` | Patch the matching row and any open detail | Same |

---

## Push

Server side is complete — `POST/DELETE /push/device` (`withAuth`),
`notifyUserDevices`, `notifyCompanyProviderDevices`, `notifyAdminDevices`, with
chunking, `DeviceNotRegistered` pruning and a fail-open contract. `push.service`
already dispatches web and native in parallel, so **no caller changes.**

### Triggers that exist today

| Event | Recipients | Source |
|-------|-----------|--------|
| New lead | Active providers of the company | `leads.service.ts:294` |
| New chat message | Company providers | `chat.service.ts:439` |
| New chat message from a customer | Admins — **only** if `isAdminChatNotifyEnabled()` | `chat.service.ts:439` |

### Device behaviour

| Concern | Behaviour |
|---------|-----------|
| Permission | Requested after the first successful sign-in, never on the sign-in screen. Declining is a supported state. |
| Registration | Every launch while signed in, and on account change. Guard on `Device.isDevice` and a resolvable EAS `projectId`. |
| Token | Never persisted locally — resolve with `getExpoPushTokenAsync` when needed. Expo tokens are stable per install. |
| Foreground | Banner + list, no sound, badge applied. A new lead is not an alarm. |
| Tap | `useLastNotificationResponse()` covers background and cold start. Guard behind `Platform.OS !== "web"`. |
| Sign-out | `DELETE /push/device` **before** tokens are cleared. Fail-open. |
| Multiple devices | Native — `tokensWhere({userId})` returns every row. |

---

## Tasks

| # | Task |
|---|------|
| 4.1 | **B3** — per-user cap for `ADMIN_CHANNEL`. Regression test: two admins × 4 connections each both succeed. |
| 4.2 | **B4** — publish `lead-status` to company + admin channels at both sites. |
| 4.3 | **B5** — `?app=` on `/app-version` with fallback; wire `appVersion.ts` to send it. |
| 4.4 | Set `EXPO_ACCESS_TOKEN` in the production `api/.env`. |
| 4.5 | Mount the shared SSE singleton against `/provider/stream` from the root layout. |
| 4.6 | `lib/liveRouter.ts` — event → store invalidation, with a per-`leadId` debounce. |
| 4.7 | Tab badges from store-derived counts. |
| 4.8 | Push registration after sign-in; unregistration before sign-out. |
| 4.9 | `lib/deepLinks.ts` with the mapping table and the overview fallback. Unit-test every branch. |
| 4.10 | **Confirm the new-lead payload's `url` and `tag`** at `leads.service.ts:294` and add its mapping — only the chat payloads were read in full during the audit. |
| 4.11 | Device tests (below). |

## Tests

Unit: SSE frame parser (frame split across chunks, `:` comment lines ignored,
malformed JSON does not kill the loop); backoff schedule; deep-link mapping
including the unknown-path fallback; the `inactive` state does **not** disconnect.

Integration: subscribe as a provider, create a lead for that company, assert the
frame arrives. After B4, assert `lead-status` reaches all three channels. After
B3, assert two admins can hold four connections each.

Device — **a physical device is required; simulators cannot register push tokens**:

- Live lead arrival while the app is foregrounded.
- Background → foreground reconnect.
- Airplane-mode on/off recovery.
- Push delivered to a locked phone.
- Tap from foreground, background and **cold start** — all three route correctly.
- iOS: a Control Centre pull does **not** drop the stream.

## Definition of done

- [ ] A lead created on the web appears on a provider's phone in under a second
      with no manual refresh.
- [ ] Push arrives on a locked phone and the tap opens the right screen from a
      cold start.
- [ ] The stream reconnects after backgrounding, network loss and an API restart.
- [ ] No unmapped path is ever passed to `router.push`.
- [ ] B3, B4, B5 shipped with tests; the client app is unaffected.

## Risks & edge cases

| Risk | Handling |
|------|----------|
| Requires physical hardware | Both an iOS and an Android device. Plan for it before starting. |
| The `inactive` distinction is iOS-only | Must be verified on iOS specifically; Android will pass either way and hide the bug. |
| Notification content on a lock screen | Reference numbers and a truncated preview only — never a phone number, an address or a full message body. Audit the payloads in this phase. |
| SSE behind Caddy buffering | Already handled server-side (`no-transform`, `X-Accel-Buffering: no`). If events arrive in bursts, check the proxy before the app. |
| Badge counts drifting from reality | Derive at render from store state; never store a count. |
