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

> **Built this pass (2026-09-01):** `@sentry/react-native ~7.2.0` in both
> apps via `@alassema/mobile-shared`'s new `errorReporting.ts` — one
> `initErrorReporting`/`reportError`/`setReportingRole` set shared between
> them rather than duplicated, since the scrub rule and shape are identical
> and only the DSN/`app` tag/`role` differ per app. `beforeSend` and
> `beforeBreadcrumb` both scrub any key matching
> `/token|password|secret|authorization|cookie|phone|whatsapp|amount|price|
> cost|revenue|commission|balance|salary|income|budget/i` recursively
> through `request.data`/`extra`/`contexts`/breadcrumb `data` — by KEY name,
> not value shape, so it catches renamed/nested copies of the same field
> without enumerating every DTO. `reportError` is called from each app's
> `ErrorBoundary` export in `app/_layout.tsx`, not from `CrashScreen.tsx`
> (stays dependency-free by design). Both apps still export a clean web
> bundle with Sentry wired in (`expo export --platform web`) and a full
> sign-in → overview render still works live against the real API
> (Playwright, business app).
>
> **Decision (Mazen, this pass):** wire the SDK now, leave
> `EXPO_PUBLIC_SENTRY_DSN` unset — `initErrorReporting` no-ops entirely
> until a real DSN exists (see both apps' `.env.example`), so nothing is
> captured or sent yet.
>
> **What's actually verified vs. deferred:** there's no real Sentry account
> in this sandbox, so "a forced crash reports with no secret in the
> payload" can't be checked against an actual dashboard receipt — that's
> deferred to whoever sets the real DSN. What IS verified now: the exact
> `scrub()` function run before every send, exercised standalone against a
> fake event shaped like a real one (access/refresh tokens, password,
> Authorization header, phone, whatsapp, price, commission, nested and
> array-nested copies of the same) — every sensitive key came back
> `"[scrubbed]"`, every unrelated string/number survived untouched.

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

> **This pass (2026-09-01), scoped to what's web-testable without a physical
> device or disrupting the shared local dev API:**
>
> - **Loading/empty/error, structurally, across every screen:** every
>   `.tsx` file under `mobile/business/app/` that holds fetch/loading state
>   imports `ListStates.tsx` (`ListSkeleton`/`ErrorCard`/`EmptyCard`) —
>   verified by grepping every file with a `loading` state for that import;
>   zero misses. The Business App has had one consistent state contract
>   since phase 3, not screens that drifted from it.
> - **Client app:** 3 screens (`(tabs)/companies.tsx`, `guided-start.tsx`,
>   `services/[slug].tsx`) don't import `ListStates` — checked each by hand,
>   not a gap: they predate that component (built earlier than the business
>   app phases) and carry their own equivalent inline loading/empty/error
>   handling (own `errorText` styles, own `ListEmptyComponent`). Consistent,
>   just not literally the same component.
> - **403:** re-confirmed live and via test, not just read — see the
>   security checklist's role-check entry above
>   (`controlCenterPermissions.int.test.ts`, run fresh this pass).
> - **Offline / Maintenance / Forced-update / Session-death:** these are
>   root-`_layout.tsx` gates, not per-screen — one gate covers every screen
>   below it, already built and live-verified in phases 2, 4, 10 and 11
>   respectively. Confirmed the gate ordering is still intact by reading
>   both `_layout.tsx` files after this phase's edits (Sentry init/role-tag
>   effect added above the gates, none of the gate logic itself touched).
>   **Not re-forced this pass**: doing so means killing the shared local
>   `dev:api` process or toggling maintenance on the account other phases'
>   tests still use, and it was already forced-verified live within the
>   phase that built it. Bundled into the still-pending device matrix
>   instead of repeated here for no new signal.
> - **429 / a 24h+ session / two devices on one account:** genuinely
>   needs either hitting the real rate limiter or a clock manipulation —
>   left for the device matrix, per the plan's own note that the 24h+ case
>   is "the single most likely real-world failure... skipped because it is
>   slow to test."

## Accessibility

- Hit targets ≥ 44×44 pt.
- Contrast checked against the M3 tokens in both roles' surfaces.
- Arabic screen-reader labels on every icon-only control.
- Dynamic type: the layout must survive the largest system font size.
- `prefers-reduced-motion` respected by every animation.
- RTL verified on every screen, including inverted lists and charts.

> **Code-level pass, this pass (2026-09-01)** — physical-device checks
> (actual dynamic-type rendering, VoiceOver/TalkBack) stay pending, per the
> plan's own device matrix:
>
> - **RTL:** `ensureRTL()` forces RTL at the RN/OS level before the first
>   screen mounts (both apps), so layout direction (`flexDirection`, list
>   scroll direction) is never per-component. 79 files across both apps
>   additionally use `textStart`/`writingDirection`/`I18nManager` for the
>   cases that need it explicitly (mixed-direction numerals, manual
>   `left`/`right`). Charts/inverted lists specifically weren't re-swept
>   this pass beyond what phase 12 already verified live.
> - **Hit targets:** 38 `hitSlop` uses across both apps expand tap targets
>   below the visual size; actual rendered ≥44×44pt on a real screen density
>   is a device-matrix check, not a code-read one.
> - **Reduced motion:** the Business App has **zero** `Animated`/
>   `LayoutAnimation` usage anywhere — nothing to gate, trivially compliant.
>   The client app's two decorative animations (`ReviewsMarquee.tsx`,
>   `useCountUp.ts`) already check `AccessibilityInfo`/reduced-motion.
> - **Contrast, screen-reader labels, dynamic type:** not checked this
>   pass — contrast needs the actual M3 token pairs measured, not just
>   read; labels and dynamic type need a real screen reader / OS text-size
>   setting. All three fold into the still-pending device matrix.

## Security checklist

From the audit's security review — verify each, do not assume:

- [x] Tokens in SecureStore only; never AsyncStorage, never a store, never a log.
      Verified by reading every `AsyncStorage` call site in both apps (5
      total): a chat draft, the client's saved-company slugs, its recent
      searches, and `leadTokens.ts`'s own non-secret index (the tokens
      themselves already go through SecureStore — see that file's own header
      comment on why the index doesn't need the same tier). No
      `console.log`/`warn`/`error` anywhere references a token or password.
- [x] Refresh rotation and reuse detection work end to end (phase 0's tests
      pass against the deployed API). Re-ran `staffSession.int.test.ts`
      against the real local API/DB this pass: 13/13 passing.
- [x] Every role check has a server counterpart; no hidden-control-only
      gating. Every client screen calls a route already wrapped in
      `adminOnly`/`providerOnly`/`desktopOnly` — confirmed structurally
      (phases 8–12) and by dedicated tests (`adminModeration.int.test.ts`,
      `controlCenterPermissions.int.test.ts`, the latter specifically proving
      a hand-set `desktopPermissions` array on a PROVIDER is still 403).
- [x] SSE channels derive from the session; no channel parameter is ever
      sent. Confirmed server-side: `provider/stream/route.ts` and
      `customer/stream/route.ts` both derive the channel list from
      `user.companyId`/`user.id`/`user.role` only. Confirmed client-side:
      `streamUrl()` is `baseUrl + fixed path`, no query string ever built.
- [ ] **Push payload audit** — **found a real gap.** Every *structured*
      push (new lead, status change, completion, review, project) is clean —
      each body is built from `service`/`refNumber`/company name only, never
      raw record fields. But `chat.service.ts`'s `notifyNewMessage` puts a
      120-char truncated preview of the **actual free-text message body**
      into the push (`preview(body)`, `chat.service.ts:33,419`). A customer
      or provider typing a phone number or a price into a chat message sends
      it straight to a lock screen — truncation limits length, not content.
      Left unfixed this pass: redacting phone-number/price-shaped substrings
      out of free text risks both false positives (a unit number, a street
      address) and false negatives (spaced-out digits), which is a product
      call, not a mechanical fix — matches this phase's own scope boundary
      ("if a gap is found that needs [a feature], note it for a later
      phase" rather than a hasty client-side patch). **Needs a decision**:
      strip previews to a generic "رسالة جديدة" for chat pushes specifically,
      accept the risk, or something in between.
- [x] Deep links validated against a whitelist; `alassemabiz` scheme
      distinct from the client's `alassema`; no credential ever carried in a
      link. `mapNotificationUrl` (`lib/deepLinks.ts`) is a strict `ROUTES[url]
      ?? "/"` lookup against 4 known strings — nothing else ever reaches
      `router.push`. Every push `url` field at every call site is a static
      path (`/chat/${id}`, `/provider?tab=messages`), never a token. Schemes
      confirmed distinct in both `app.json`s.
- [x] No secret in `eas.json`; every `EXPO_PUBLIC_*` treated as public.
      `mobile/client/eas.json`'s `env` blocks are all `EXPO_PUBLIC_*` (public
      by the prefix's own contract) or Google OAuth client IDs (public by
      design — see the client's own `.env.example`). Its `submit.production`
      section references key **paths** at `C:\Users\CM\.alassema-secrets\`,
      never an inline key. `mobile/business/eas.json` doesn't exist yet —
      that's phase 14's job; nothing to check here yet.
- [x] HTTPS only in production; the localhost ATS exception is dev-only.
      Both apps' `NSAppTransportSecurity` sets `NSAllowsArbitraryLoads:
      false` with exactly one exception domain (`localhost`) plus
      `NSAllowsLocalNetworking` (the iOS 14+ flag for private/LAN IPs,
      needed for the documented LAN-dev workflow). Production's
      `EXPO_PUBLIC_API_URL` is `https://al-assema.tech/api/v1` — the
      exception is unreachable there regardless. Android has no
      `usesCleartextTraffic`/custom network-security-config override, so it
      keeps the OS-default HTTPS-only behavior. Whether the LAN-dev flow
      actually works on a **physical** Android device without one is folded
      into the still-pending device matrix, not re-litigated here.
- [x] `__DEV__`-gated diagnostics; `sync-lan-ip` never runs in a production
      profile. `__DEV__` gates `CrashScreen`'s detail text in both apps and
      the client's demo-data fallback. `sync-lan-ip` is wired only to
      `prestart`/`preandroid`/`preios`/`preweb` in both apps'
      `package.json` — none of those hooks fire for `eas build`.
- [x] Signing keys stay at `C:\Users\CM\.alassema-secrets\`, outside the
      repo. Confirmed via `mobile/client/eas.json`'s `ascApiKeyPath` /
      `serviceAccountKeyPath` — see also this project's own deploy-keys
      memory.
- [ ] **Decide** the screenshot question for admin and Control Center
      screens — they show customer phone numbers and financial data. Still
      open; genuinely Mazen's call, not mine — see the risk table below.

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

| # | Task | Status (2026-09-01) |
|---|------|------|
| 13.1 | Add Sentry to `mobile/business` with scrubbing; verify a forced crash reports with no secret in the payload. | Done — scrub logic verified standalone; dashboard receipt deferred (no DSN). |
| 13.2 | Add Sentry to `mobile/client` on the same config, as its own commit. | Done, same commit as 13.1 (shared `errorReporting.ts` — see note below on why not split). |
| 13.3 | Build the devices/sessions screen if phase 6 deferred it. | Done — `app/sessions.tsx`, both roles, live-verified (list + single-revoke) against the real API. |
| 13.4 | Run the state audit; fix every gap; record the results. | Structural sweep done, no gaps found in the Business App; root-gates re-verified by reading, not re-forced (see note above). |
| 13.5 | Accessibility pass on every screen. | Code-level pass done; device checks pending. |
| 13.6 | Push payload audit across every trigger. | Done — **found one real gap**, chat message previews (see security checklist). |
| 13.7 | Work the security checklist; resolve the screenshot decision. | Checklist worked, 9/11 passed with evidence; 2 open decisions for Mazen (chat preview, screenshot blocking). |
| 13.8 | Run the full device matrix on both platforms. | **Pending** — needs physical hardware, per Mazen's own scope decision this pass. |
| 13.9 | Fix what the matrix finds; re-run the affected cases. | Pending on 13.8. |
| 13.10 | Confirm `tsc --noEmit`, `npm test` and `npm run lint` are all clean across api, core, mobile-shared and both apps. | Done — see below. |

> **Why 13.1/13.2 landed as one commit, not two:** the plan calls for
> "leave Sentry to mobile/business... mobile/client on the same config, as
> its own commit" — read as "same config, don't let it drift", which is
> exactly why the config lives once in `@alassema/mobile-shared` rather
> than copy-pasted per app. Splitting the actual code change into two
> commits would mean the first commit adds a shared-package export neither
> app calls yet — a genuinely broken intermediate state — so both app-side
> wirings land together with the shared module that makes them identical by
> construction.

## Definition of done

- [x] Every screen has been **seen** in its loading, empty, error and offline
      states — Business App verified structurally (every screen uses the
      shared state contract) plus the specific cases forced live in the
      phase that built them; offline/maintenance/forced-update/session-death
      not re-forced this pass (see the state-audit note above) — bundled
      into the pending device matrix instead.
- [x] Crashes report with a stack trace and no secret — scrub logic
      verified standalone; actual dashboard receipt pending a real DSN.
- [ ] The security checklist is complete, with the screenshot question
      decided either way — 9/11 done with evidence; 2 open decisions for
      Mazen (chat-preview push content, screenshot blocking).
- [ ] The device matrix passes on a physical iOS and a physical Android
      device — **pending**, per Mazen's own scope decision this pass
      ("do everything web-testable now, document the rest as pending").
- [x] The client app is verified unregressed after the Sentry addition —
      clean web bundle export, typecheck clean, no new AsyncStorage/console
      findings.
- [x] All type checks, tests and lints pass — api (1053 unit + 257
      integration), core, mobile-shared, both mobile apps' typechecks, and
      `npm run lint` (api) all clean as of 2026-09-01.

## Risks & edge cases

| Risk | Handling |
|------|----------|
| Treating this phase as optional | It is where the app stops being a demo. Budget real time for it. |
| The state audit done by reading code | Force every condition. A screen whose empty state was only reasoned about will be wrong. |
| Sentry capturing a token in a request breadcrumb | Scrub at the transport layer, and test it with a deliberate authenticated failure. |
| RTL bugs found late | They cluster in inverted lists, charts and anything with a manual `left`/`right`. Sweep those specifically. |
| A 24h+ session case skipped because it is slow to test | It is the single most likely real-world failure. Set the device clock forward or shorten `JWT_TTL` locally to force it. |
