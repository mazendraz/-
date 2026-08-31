# Phase 9 — Admin: moderation queue

> Part of the [Business App build plan](README.md). Read that first.

**Depends on:** phase 8 · **Unblocks:** nothing
**Backend change:** none · **Roles:** ADMIN

---

## Objective

One triage queue that clears everything blocking a provider or a customer:
change requests, project submissions, company reviews, site testimonials, and
user feedback.

**This is the admin's real mobile job.** Approvals are the work that is
time-sensitive, low-input and blocking someone else — exactly what belongs on a
phone. Everything else in the admin dashboard can wait for a desk.

## Scope

**In:** a unified approvals inbox over five queues, with per-type detail and
approve/reject actions.

**Out:** the underlying entities' full editing surfaces — companies and catalog
are phase 10.

---

## The five queues

| Queue | What blocks on it | Type |
|-------|------------------|------|
| **Change requests** | Every provider profile edit, offering publish, tier publish and bundle rule. Nothing a provider changes goes public until this clears. | `ChangeRequest` |
| **Projects** | A provider's portfolio submission — `PENDING → APPROVED \| REJECTED` | `ApiProject` |
| **Company reviews** | Customer reviews awaiting moderation before they appear on a profile | `ApiReview` |
| **Site reviews** | Testimonials for the homepage marquee | `ApiSiteReview` |
| **Feedback** | Problem / suggestion / inquiry submissions from the public form | `ApiFeedback` |

Change requests are the highest-value of the five: they are the bottleneck for
[phase 6](phase-6-provider-operations.md)'s profile edits and
[phase 7](phase-7-provider-catalog.md)'s publish flow. If only one queue shipped,
it would be this one.

---

## Screens

### `(admin)/approvals`

A segmented inbox — one segment per queue, each with a pending count on the tab.
Default to the queue with the oldest waiting item, not to a fixed first segment.

Row shows: what changed, who requested it, how long it has waited. Tapping opens
the type-specific detail.

### `approvals/change-request/[id]`

Before/after diff of the requested change, the requesting company, and
approve/reject with an optional note. A change request can carry a profile edit,
a publish request, a tier or a bundle rule — render the payload per kind rather
than dumping raw JSON.

### `approvals/project/[id]`

The submitted photo at full size (via `expo-image` — uploads are WebP), the
company, approve/reject.

### `approvals/review/[id]` and `approvals/site-review/[id]`

Review body, rating, author, target company where applicable. Approve, reject, or
delete.

### `approvals/feedback/[id]`

Type (`problem | suggestion | inquiry`), body, contact details, mark handled or
delete.

---

## APIs

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/admin/change-requests` | Queue |
| GET | `/admin/change-requests/[id]` | One request |
| PATCH | `/admin/change-requests/[id]` | Approve / reject |
| GET | `/admin/projects` | Queue |
| PATCH · DELETE | `/admin/projects/[id]` | Approve / reject · delete |
| GET | `/admin/reviews` | Queue |
| PATCH · DELETE | `/admin/reviews/[id]` | Moderate · delete |
| GET | `/admin/site-reviews` | Queue |
| PATCH · DELETE | `/admin/site-reviews/[id]` | Moderate · delete |
| PUT | `/admin/site-reviews/settings` | Marquee settings |
| GET | `/admin/feedback` | Queue |
| PATCH · DELETE | `/admin/feedback/[id]` | Handle · delete |

All `adminOnly`.

---

## Components

`QueueSegments`, `ApprovalRow`, `WaitingFor` (relative age), `DiffBlock`,
`ApproveRejectBar`, `RejectNoteSheet`, `RatingStars`, `PhotoPreview`.

`DiffBlock` is the one that earns its keep — a change request is only reviewable
if the reviewer can see what actually changed, field by field.

## State

`approvalsStore` holding all five queues with independent `fetchedAt` stamps and
derived pending counts. Refetch on focus; refetch the affected queue after every
action.

## Realtime / push

No SSE event exists for approvals. Focus refetch plus a slow interval is
correct — do not invent a client-side poll faster than a person's attention.

Notifying an admin that a change request is waiting would need a new server-side
trigger; that is a **future** change, not part of this phase.

---

## Tasks

| # | Task |
|---|------|
| 9.1 | `lib/approvals.ts` — one module fronting all five queues with a normalised row shape. |
| 9.2 | `approvalsStore` with per-queue state and derived counts. |
| 9.3 | Segmented inbox; default to the oldest waiting item. |
| 9.4 | `DiffBlock` rendering a change-request payload per kind. |
| 9.5 | Change-request detail with approve/reject and an optional note. |
| 9.6 | Project detail with full-size WebP preview and approve/reject. |
| 9.7 | Review and site-review detail with moderate/delete. |
| 9.8 | Feedback detail with handle/delete. |
| 9.9 | Site-review marquee settings form. |
| 9.10 | Optimistic row removal on action, with rollback and a toast on failure. |
| 9.11 | Tests + device pass over one of each queue type. |

## Tests

Unit: the normalised row mapping for all five types; `WaitingFor` relative-age
formatting in Arabic; `DiffBlock` for each change-request kind.

Integration: approving a change request makes the underlying edit public;
approving a project flips it to `APPROVED`; a PROVIDER token is 403 on every route
here.

E2E: a provider files a profile change in the business app → an admin approves it
on another device → the provider sees it live.

## Definition of done

- [ ] An admin clears one of each of the five queue types from the phone.
- [ ] Approving a change request unblocks the provider who filed it, verified end to end.
- [ ] Pending counts are accurate and update after every action.
- [ ] Rejecting captures a reason where the API accepts one.

## Risks & edge cases

| Risk | Handling |
|------|----------|
| An unreadable diff | The whole queue is worthless if the reviewer cannot see what changed. Build `DiffBlock` first and test it against every change-request kind that exists. |
| Approving the wrong item after an optimistic removal | Actions must carry the item id, never a list index. |
| Two admins acting on the same item | The second gets a `CONFLICT`. Refetch and re-present rather than showing a raw error. |
| WebP project photos on iOS | `expo-image` only. |
| An empty queue reading as a loading failure | Distinct, positively-worded empty state per queue. |
