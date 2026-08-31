# Phase 5 — Provider: chat

> Part of the [Business App build plan](README.md). Read that first.

**Depends on:** phase 4 · **Unblocks:** phase 8's admin chat reuses these components
**Backend change:** none · **Roles:** PROVIDER

---

## Objective

Providers hold customer conversations from the phone, live.

## Scope

**In:** thread list, thread view, sending, read state, drafts, live delivery.

**Out:** admin chat controls — hide-message and close-thread are `adminOnly` and
belong to phase 8.

---

## How the existing system works

- **Model.** One `Conversation` per `Lead`, with `Message` rows.
  `chat.service.ts` exposes `Viewer = "customer" | "provider" | "admin"` — all
  three participants are already contemplated. This phase fills the provider seat;
  it introduces no new concept.
- **Access.** `assertProviderAccess(conversationId, companyId)` gates the
  provider side. A thread belongs to exactly one company, and reading another's
  would expose a customer's private messages.
- **Read state.** `markRead(conversationId, viewer)` is per-viewer. A **full
  open** marks read; a **delta poll** with `?after=` deliberately does not.
- **Pagination.** `getThread(conversationId, viewer, after?)` — `after` is a
  numeric cursor.
- **Sending.** `POST` with `{ body }`. The route strips HTML server-side and sets
  `sender` **from the guard, never from the payload**. Returns 201 + `ApiMessage`.
- **Notification.** Posting publishes a `message` event, then queues Telegram and
  push after the response. `shouldNotify` debounces so a burst of messages does
  not produce a burst of pushes.

---

## Screens

### `(provider)/messages`

Threads for this company, most recently active first, unread badge, last-message
preview.

### `chat/[conversationId]`

Thread view with composer. Opening performs a **full fetch** (marks read); every
SSE-triggered update performs a **delta fetch** with `?after=` (does not).

Preserving that distinction is what keeps unread counts honest. Assert it in a
test, not just in review.

---

## APIs

| Method | Route | Guard | Purpose |
|--------|-------|-------|---------|
| GET | `/provider/chat` | `providerOnly` | Company threads, most recently active first |
| GET | `/provider/chat/[conversationId]?after=` | `providerOnly` | `ThreadResult`. Ownership via `assertProviderAccess`. |
| POST | `/provider/chat/[conversationId]` | `providerOnly` | `{ body }` → `ApiMessage` (201) |

A provider whose account has no `companyId` gets a `ValidationError` from
`companyOf(user)` — render the same explanatory state as phase 3, not an error card.

---

## Components

`ThreadRow`, `MessageBubble`, `Composer`, `DayDivider`, `UnreadBadge`,
`SendFailedChip`.

Build role-agnostic — phase 8 reuses all of them against `/admin/chat/*`.

## State

- `threadsStore` — list + unread counts.
- Per-conversation message store with an `after` cursor.
- Draft text per conversation in AsyncStorage, restored on open.

## Realtime

`message` event → if `conversationId` matches the open thread, delta fetch; else
refetch the thread list and bump the Messages badge.

## Push

New-message push routes to `(provider)/messages` via `deepLinks.ts` (phase 4).

---

## Tasks

| # | Task |
|---|------|
| 5.1 | `lib/chat.ts` with a role-selected route prefix, so phase 8 swaps the prefix and reuses everything else. |
| 5.2 | `threadsStore` + per-conversation store with cursor. |
| 5.3 | Thread list with unread badges and previews. |
| 5.4 | Thread screen: inverted list, day dividers, keyboard-aware composer. |
| 5.5 | Optimistic send keyed by a local temp id, reconciled against the returned `ApiMessage.id`. |
| 5.6 | Visible failure + retry on the bubble when a send fails. |
| 5.7 | Drafts persisted per conversation. |
| 5.8 | Wire the `message` SSE event to delta fetch / list refresh. |
| 5.9 | Full fetch on focus (marks read) vs delta on SSE (does not) — with a test. |

## Tests

Unit: cursor merge; optimistic reconcile (the temp bubble is **replaced**, not
appended beside the server copy); dedupe on server id; ordering preserved.

Integration: a cross-company `conversationId` returns 403; read state clears only
on a full open; HTML in a sent body is stripped server-side.

E2E: a customer sends from the client app → the provider's phone shows it live in
under a second, and the reply comes back the same way.

## Definition of done

- [ ] Two-way messaging is live in under a second, both directions.
- [ ] Unread counts are correct after open, background, and a delta update.
- [ ] A failed send is visibly retryable and never silently lost.
- [ ] Drafts survive leaving and returning to a thread.

## Risks & edge cases

| Risk | Handling |
|------|----------|
| **Sending offline** | Fail loudly with a retry affordance. **No background send queue in v1** — a silently queued message that arrives an hour later is worse than a visible failure. |
| Keyboard handling under forced RTL | Test on both platforms; RTL plus an inverted list is the classic place layout breaks. |
| Duplicate bubbles after a reconnect | Dedupe on server id, always. The temp id exists only until the POST resolves. |
| Marking read from a delta | Would silently zero a genuine unread count. This is the one behaviour to cover with an explicit test. |
| A very long thread | Cursor pagination upward; do not fetch the whole history on open. |
