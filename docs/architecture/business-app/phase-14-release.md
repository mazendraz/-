# Phase 14 — Builds & store release

> Part of the [Business App build plan](README.md). Read that first.

**Depends on:** phase 13 · **Unblocks:** —
**Backend change:** none · **Roles:** —

---

## Objective

A signed production build of the business app on the App Store and Google Play,
with a working rollback path.

---

## Identity — distinct from the client app at every level

| Item | Client app (shipped) | Business app |
|------|---------------------|--------------|
| EAS project | `ed93c3b0-fbd6-48ed-be32-c9312e4e5d47` | **new** — `eas init` |
| Slug | `alassema-client` | `alassema-business` |
| iOS bundle | `com.alassema.client` | `com.alassema.business` |
| Android package | `com.alassema.client` | `com.alassema.business` |
| Scheme | `alassema` | `alassemabiz` |
| Icon / splash | Consumer brand | **Visually distinct** — two Al Assema icons on one home screen must be told apart at a glance |
| Store visibility | Public | Public listing, sign-in only, no self-registration |

## Build profiles

Copy the shape of [`mobile/client/eas.json`](../../../mobile/client/eas.json):

- **development** — `developmentClient: true`, internal distribution, physical device.
- **preview** — internal distribution, channel `preview`, for Mazen and staff testers.
- **production** — channel `production`, `autoIncrement: true`.

Each profile carries its own `env` block with
`EXPO_PUBLIC_API_URL="https://al-assema.tech/api/v1"`.

> The business app needs **none** of the Google, Apple or Turnstile client IDs the
> client app's profiles carry. Do not copy them across — an unused public key in a
> bundle is noise at best.

## Credentials

| Item | Status |
|------|--------|
| Apple team `SS923F3FW8` | reusable |
| App Store Connect API key `AuthKey_69TH75M6BG.p8` | reusable — at `C:\Users\CM\.alassema-secrets\` |
| Apple **App ID** `com.alassema.business` | **new**, with the push capability enabled |
| Google Play service account | reusable — same secrets directory |
| Play **listing** + internal track | **new** |
| Push (APNs/FCM) | handled by Expo; ensure `EXPO_ACCESS_TOKEN` is set server-side |

Sign in with Apple is **not** required: staff authenticate with a password and the
app offers no third-party sign-in, so Apple's guideline does not apply. Note this
in the review submission in case a reviewer asks.

## Versioning, OTA and rollback

- `runtimeVersion.policy: "appVersion"` — a native dependency change needs a new
  build, not an OTA.
- **OTA** for JS-only fixes on the `production` channel.
- **Rollback, in order of speed:**
  1. Republish the previous known-good OTA update to the channel — fastest, and the reason the channel exists.
  2. Raise `APP_MIN_VERSION_BUSINESS` (phase 4's B5) to block a broken build outright — a config change plus a restart, not a deploy.
  3. Halt the Play staged rollout / expedite an iOS review — last resort.

Because B5 makes the version gate per-app, blocking a broken business build does
**not** touch the client app. Verify that separation before relying on it.

## Submission

1. Internal testing track (Play) and TestFlight internal (iOS) with real staff first.
2. **A reviewer demo account**, seeded with a provider company that has leads,
   messages, a waitlist and a portfolio. A reviewer who cannot sign in rejects the app.
3. Review notes stating plainly: accounts are provisioned by the operator, there is
   no public sign-up, and this is a staff companion to the published Al Assema client app.
4. Privacy disclosures: staff credentials, customer contact data shown to staff,
   chat content, push tokens.
5. Staged Play rollout; monitor the crash-free rate before widening.

---

## Tasks

| # | Task |
|---|------|
| 14.1 | `eas login` and `eas init` in `mobile/business`; record the new `projectId` in `app.json`. |
| 14.2 | Icons, adaptive icon, splash — visually distinct from the client app. |
| 14.3 | Write `eas.json` with the three profiles and the submit block. |
| 14.4 | Create the Apple App ID with push capability; register the bundle. |
| 14.5 | Create the Play listing and internal track. |
| 14.6 | Development build; install on both physical devices; verify push registration now that a real `projectId` exists. |
| 14.7 | Preview build; distribute to staff testers; collect feedback. |
| 14.8 | Set `APP_MIN_VERSION_BUSINESS` / `APP_LATEST_VERSION_BUSINESS` / store URLs in the production `api/.env`. |
| 14.9 | Production builds for both platforms. |
| 14.10 | Seed and verify the reviewer demo account. |
| 14.11 | Store listings, screenshots, privacy disclosures, review notes. |
| 14.12 | Submit; respond to review; staged rollout. |
| 14.13 | Verify an OTA update reaches an installed production build. |
| 14.14 | Verify the version gate blocks a build **without** affecting the client app. |

## Definition of done

- [ ] Production builds succeed for iOS and Android.
- [ ] Both store submissions are accepted, with a working demo account.
- [ ] OTA reaches an installed build.
- [ ] `APP_MIN_VERSION_BUSINESS` blocks the business app and leaves the client app untouched.
- [ ] Rollback path 1 and path 2 have each been exercised at least once, deliberately.
- [ ] Production env vars are set and documented.

## Risks & edge cases

| Risk | Handling |
|------|----------|
| **Store review of a staff-only app with no public sign-up** | The most likely rejection reason. Working demo credentials plus explicit review notes, prepared before the first submission rather than after a rejection. |
| Push not working in production despite working in dev | A real `projectId` and a production APNs/FCM path differ from a dev build. Re-verify push on the **production** build, not just the preview. |
| Two similar icons on one phone | Staff will install both. Make them distinguishable at icon size, not just at full size. |
| `EXPO_ACCESS_TOKEN` unset in production | Sends still work but receipts and rate limits are unattributable. Set it in phase 4; confirm here. |
| An OTA that itself breaks the app | Path 2 (the version gate) is the recovery, which is why it must be tested before it is needed. |
| Bundle-ID typos | Unfixable after first submission. Check `com.alassema.business` in `app.json`, `eas.json`, the Apple App ID and the Play listing, character by character. |
