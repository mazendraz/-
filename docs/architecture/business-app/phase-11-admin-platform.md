# Phase 11 — Admin: platform administration

> Part of the [Business App build plan](README.md). Read that first.

**Depends on:** phase 8 · **Unblocks:** nothing
**Backend change:** none · **Roles:** ADMIN

---

## Objective

The remaining platform-level administration: staff accounts, site settings,
maintenance mode, content pages, email templates, Telegram, and the audit log.

## Scope

**In:** everything in the table below.

**Out:** the `desktopOnly` modules (phase 12).

> **Honest framing.** Several of these screens have low mobile value — email
> templates and legal pages are long-form editing that belongs on a keyboard.
> They are included because the goal is the complete surface, so that nothing
> forces a laptop. Build them last within this phase, and keep them simple:
> a mobile text editor does not need to match the web dashboard's.

---

## Screens

### `team`

Staff accounts. Create, edit, activate/deactivate, delete. `ApiAdminUser`,
`ApiAdminUserCreatePayload`, `ApiAdminUserUpdatePayload`.

> **Deactivating is the live kill switch.** `getAuthUser` re-reads `isActive` on
> every request, so `isActive: false` ends every session that account holds —
> web, desktop and mobile — on its next request. Say exactly that in the confirm
> dialog.

Editing a user's role or password moves `tokensValidFrom`, which invalidates
every token issued before that moment. Same warning applies.

This screen can also grant `desktopPermissions` — see
[phase 12](phase-12-control-center.md) for what each permission unlocks.

### `settings`

`ApiPlatformSettings` via `GET`/`PUT /admin/settings`. Full-representation `PUT`.

### `settings/maintenance`

`ApiMaintenanceStatus`. **Takes the public site down.** Hard confirm — require a
deliberate second action, not a single toggle. Show the current state
unambiguously at the top of the admin overview whenever maintenance is on.

### `settings/notifications`

`ApiAdminNotificationSettings` — including the chat-push toggle that gates whether
admins receive a push when a customer sends a message
([`chat.service.ts:439`](../../../api/src/lib/services/chat.service.ts)).

### `settings/telegram`

Link and unlink the admin Telegram channel.

### `content/pages`

`ApiLegalPages` — the legal and informational pages, via `GET`/`PUT /admin/pages`.

### `content/email-templates`

`ApiEmailTemplates` via `GET`/`PUT /admin/email-templates`.

### `audit-log`

`ApiPage<ApiAuditLog>` — the append-only admin action trail. Read-only, filterable
by actor and action.

---

## APIs

| Method | Route | Purpose |
|--------|-------|---------|
| GET · POST | `/admin/users` | List · create staff |
| PATCH · DELETE | `/admin/users/[id]` | Update · delete |
| GET · PUT | `/admin/settings` | `ApiPlatformSettings` |
| GET · PATCH | `/admin/maintenance` | `ApiMaintenanceStatus` |
| GET · PATCH | `/admin/notification-settings` | `ApiAdminNotificationSettings` |
| GET · PUT | `/admin/pages` | `ApiLegalPages` |
| GET · PUT | `/admin/email-templates` | `ApiEmailTemplates` |
| GET · DELETE | `/admin/telegram` | Link status · unlink |
| GET | `/admin/telegram/link` | Produce a link URL |
| GET | `/admin/audit-logs` | `ApiPage<ApiAuditLog>` |

All `adminOnly`. `PUT` routes take a **full representation**.

### One route to verify before building on it

`GET /admin/notifications` exists, but its own source comment says it is a no-op
with no backing table — the admin notification bell was never given a real feed.
**Confirm its current behaviour before building any screen on it.** If it is still
a stub, the admin's notification surface is push plus the SSE badge from phase 8,
and that is the honest answer.

---

## Components

`UserRow`, `UserForm`, `RoleSelector`, `PermissionChecklist`, `DangerConfirm`,
`SettingsSection`, `MarkdownEditor` (simple — bold, links, headings),
`AuditLogRow`, `MaintenanceBanner`.

`DangerConfirm` is used by three screens here and by phase 8's lead delete. Build
it once: it requires a deliberate confirmation gesture and states the consequence
in plain Arabic.

## State

`teamStore`, `settingsStore`, `auditStore`. Focus refetch; invalidate after writes.

---

## Tasks

| # | Task |
|---|------|
| 11.1 | `lib/adminTeam.ts`, `lib/adminSettings.ts`, `lib/adminContent.ts`, `lib/adminAudit.ts`. |
| 11.2 | Team list with role and active-state chips. |
| 11.3 | Create-user form with role selection and a generated initial password flow. |
| 11.4 | Edit user: role, active state, `desktopPermissions` checklist. |
| 11.5 | `DangerConfirm` component; wire it to deactivate, delete, and maintenance. |
| 11.6 | Platform settings form — full-representation `PUT`. |
| 11.7 | Maintenance screen with hard confirm and a persistent banner on the admin overview while active. |
| 11.8 | Notification settings including the chat-push toggle. |
| 11.9 | Telegram link/unlink, opening the system browser. |
| 11.10 | Legal pages editor with a simple markdown editor and preview. |
| 11.11 | Email templates editor with variable hints and preview. |
| 11.12 | Audit log list with actor/action filters and pagination. |
| 11.13 | **Verify `/admin/notifications`** and either build on it or document that it is a stub. |
| 11.14 | Tests + device pass. |

## Tests

Unit: full-representation `PUT` builders for settings, pages and templates;
`PermissionChecklist` mapping to the eight `DESKTOP_PERMISSIONS` values;
`DangerConfirm` cannot fire on a single tap.

Integration: deactivating a user 401s that user's next request; a PROVIDER token
is 403 on every route here; enabling maintenance makes the public API return
`MAINTENANCE` and the client app raises its maintenance screen.

E2E: turn maintenance on from the phone → confirm the client app shows its
maintenance screen → turn it off → confirm recovery.

## Definition of done

- [ ] An admin manages staff accounts including desktop permissions.
- [ ] An admin toggles maintenance mode from the phone, with a hard confirm and a
      persistent indicator while it is on.
- [ ] Platform settings, legal pages and email templates are editable without
      blanking fields.
- [ ] The audit log is browsable and filterable.
- [ ] `/admin/notifications` behaviour is confirmed and documented.

## Risks & edge cases

| Risk | Handling |
|------|----------|
| **Maintenance mode from a phone** | The single most consequential control in the app. Hard confirm, persistent banner, and make turning it off at least as easy as turning it on. |
| **Deactivating yourself** | An admin can deactivate their own account and be signed out mid-session. Block it client-side and explain why. |
| Deleting the last admin | Confirm what the API does before writing the dialog. |
| `PUT` blanking settings fields | Build the body from the freshly-fetched record. Same risk as phase 10. |
| Long-form editing on a phone | Accept that it is a fallback, not the primary surface. Autosave drafts locally so a call mid-edit does not lose the work. |
| Granting `desktopPermissions` | These unlock financial data in the desktop app. Show what each permission means, not just its slug. |
