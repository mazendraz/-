# Phase 13 — Hardening

> Part of the [Business App build plan](README.md). Read that first.

**Depends on:** phases 3–12 · **Unblocks:** phase 14
**Backend change:** none · **Roles:** both

---

## Objective

Behave correctly when the network, the server, or the person does something
unexpected — and prove it, rather than assuming it.

## Scope

**In:** crash reporting, the state audit, accessibility, the security checklist,
the full device matrix.

**Out:** new features. If a gap is found that needs one, note it for a later
phase rather than growing this one.

---

## Crash & error reporting

Sentry (or equivalent) in **both** apps — this was in the original mobile plan and
never landed in the client app either, so it is a shared gap, not a business-app
one.

Requirements:

- Scrub **before** the transport, not after: no access token, no refresh token,
  no password, no customer phone number, no financial figure.
- Tag events with role and app version.
- The existing `ErrorBoundary` → `CrashScreen` path stays as the user-facing
  behaviour; Sentry only adds reporting behind it.

## The state audit

Walk **every** screen built in phases 3–12 against the shared screen contract in
[README](README.md#the-shared-screen-contract). For each, verify by forcing the
condition — not by reading the code:

| State | How to force it |
|-------|-----------------|
| Loading | Throttle the network |
| Empty | Seed an account with no data |
| Error 403 | Call a route the role cannot reach |
| Error 429 | Trip the login rate limit |
| Error 5xx | Stop the API mid-session |
| Offline | Airplane mode |
| Maintenance | Toggle it from phase 11 |
| Forced update | Set `APP_MIN_VERSION_BUSINESS` above the build |
| Session death | Revoke the session from another device |

Record the result per screen. A screen that has never been seen in its empty state
has not been built.

## Accessibility

- Hit targets ≥ 44×44 pt.
- Contrast checked against the M3 tokens in both roles' surfaces.
- Arabic screen-reader labels on every icon-only control.
- Dynamic type: the layout must survive the largest system font size.
- `prefers-reduced-motion` respected by every animation.
- RTL verified on every screen, including inverted lists and charts.

## Security checklist

From the audit's security review — verify each, do not assume:

- [ ] Tokens in SecureStore only; never AsyncStorage, never a store, never a log.
- [ ] Refresh rotation and reuse detection work end to end (phase 0's tests pass against the deployed API).
- [ ] Every role check has a server counterpart; no hidden-control-only gating.
- [ ] SSE channels derive from the session; no channel parameter is ever sent.
- [ ] **Push payload audit** — titles and bodies reach a lock screen. Reference numbers and truncated previews only: no phone number, no address, no full message body, no financial figure.
- [ ] Deep links validated against a whitelist; `alassemabiz` scheme distinct from the client's `alassema`; no credential ever carried in a link.
- [ ] No secret in `eas.json`; every `EXPO_PUBLIC_*` treated as public.
- [ ] HTTPS only in production; the localhost ATS exception is dev-only.
- [ ] `__DEV__`-gated diagnostics; `sync-lan-ip` never runs in a production profile.
- [ ] Signing keys stay at `C:\Users\CM\.alassema-secrets\`, outside the repo.
- [ ] **Decide** the screenshot question for admin and Control Center screens — they show customer phone numbers and financial data. A real trade-off against usability, not an obvious yes.

## Device matrix

| Platform | Cases |
|----------|-------|
| **iOS** (physical, 16+) | Push permission and delivery · `inactive` vs `background` (Control Centre, app switcher, incoming call) · Keychain persistence across reinstall · RTL on every screen · dynamic type |
| **Android** (physical, 10+) | FCM delivery · notification channel colour · predictive back · Keystore persistence · RTL · deep-link intent filters |
| **Both** | Cold start on a slow network · airplane-mode toggle mid-session · a session spanning an access-token expiry (>24h) · two devices on one account · a role switch (sign out as provider, in as admin, on the same device) |

> The role switch matters more than it looks: `registerDevice` upserts on the
> token and re-points the row to whoever is now signed in. Verify the previous
> account stops receiving notifications on that phone.

---

## Tasks

| # | Task |
|---|------|
| 13.1 | Add Sentry to `mobile/business` with scrubbing; verify a forced crash reports with no secret in the payload. |
| 13.2 | Add Sentry to `mobile/client` on the same config, as its own commit. |
| 13.3 | Build the devices/sessions screen if phase 6 deferred it. |
| 13.4 | Run the state audit; fix every gap; record the results. |
| 13.5 | Accessibility pass on every screen. |
| 13.6 | Push payload audit across every trigger. |
| 13.7 | Work the security checklist; resolve the screenshot decision. |
| 13.8 | Run the full device matrix on both platforms. |
| 13.9 | Fix what the matrix finds; re-run the affected cases. |
| 13.10 | Confirm `tsc --noEmit`, `npm test` and `npm run lint` are all clean across api, core, mobile-shared and both apps. |

## Definition of done

- [ ] Every screen has been **seen** in its loading, empty, error and offline states.
- [ ] Crashes report with a stack trace and no secret.
- [ ] The security checklist is complete, with the screenshot question decided either way.
- [ ] The device matrix passes on a physical iOS and a physical Android device.
- [ ] The client app is verified unregressed after the Sentry addition.
- [ ] All type checks, tests and lints pass.

## Risks & edge cases

| Risk | Handling |
|------|----------|
| Treating this phase as optional | It is where the app stops being a demo. Budget real time for it. |
| The state audit done by reading code | Force every condition. A screen whose empty state was only reasoned about will be wrong. |
| Sentry capturing a token in a request breadcrumb | Scrub at the transport layer, and test it with a deliberate authenticated failure. |
| RTL bugs found late | They cluster in inverted lists, charts and anything with a manual `left`/`right`. Sweep those specifically. |
| A 24h+ session case skipped because it is slow to test | It is the single most likely real-world failure. Set the device clock forward or shorten `JWT_TTL` locally to force it. |
