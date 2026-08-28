# Al Assema — Mobile Client

> **Package:** `@alassema/mobile-client` · **Platform:** iOS + Android · **Framework:** Expo SDK 54 (React Native 0.81)

The customer-facing mobile app for [Al Assema](https://alassema.com) — a service-directory and lead-generation platform for Egypt's New Administrative Capital. Clients browse verified service providers (finishing, décor, contracting, etc.), submit service requests, and communicate with companies via in-app chat.

This is a **managed Expo** project inside a monorepo (`العاصمة/mobile/client/`), sharing types, validation, and business logic with the web frontend (`app/`) and API (`api/`) through the [`@alassema/core`](#shared-core-package) workspace package.

---

## Table of Contents

1. [Tech Stack](#tech-stack)
2. [Architecture Overview](#architecture-overview)
3. [Project Structure](#project-structure)
4. [Navigation & Routing](#navigation--routing)
5. [Screens Reference](#screens-reference)
6. [State Management](#state-management)
7. [API Layer](#api-layer)
8. [Authentication](#authentication)
9. [Real-time Features](#real-time-features)
10. [Push Notifications](#push-notifications)
11. [RTL & Internationalization](#rtl--internationalization)
12. [Security](#security)
13. [Resilience & Error Handling](#resilience--error-handling)
14. [Shared Core Package](#shared-core-package)
15. [Environment Variables](#environment-variables)
16. [Local Development](#local-development)
17. [Build & Release Pipeline](#build--release-pipeline)
18. [OTA Updates](#ota-updates)
19. [Key Technical Decisions](#key-technical-decisions)
20. [Component Library](#component-library)

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Runtime** | React Native 0.81 · Hermes engine |
| **Framework** | Expo SDK 54 · Expo Router 6 (file-based routing) |
| **Language** | TypeScript 5.9 (strict mode) |
| **Navigation** | Expo Router (React Navigation under the hood) |
| **Storage** | `expo-secure-store` (auth tokens) · `@react-native-async-storage` (settings) |
| **Networking** | Custom `apiFetch` wrapper · SSE via EventSource polyfill |
| **Push** | `expo-notifications` (FCM + APNs) |
| **Auth** | JWT Bearer tokens · `expo-auth-session` (Google OAuth) · `expo-apple-authentication` (Sign in with Apple) |
| **CAPTCHA** | Cloudflare Turnstile (rendered in WebView) |
| **Media** | `expo-image` (optimized image loading), `expo-video` (gallery videos) |
| **Fonts** | Cairo (Arabic body) · Alexandria (UI elements) via `expo-font` |
| **Shared Logic** | `@alassema/core` workspace package |
| **Build** | EAS Build + EAS Submit |
| **OTA** | EAS Updates (`expo-updates`) |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                    Root Layout                       │
│  ┌─────────┐ ┌──────────┐ ┌───────────┐ ┌────────┐ │
│  │ Session  │ │ Settings │ │ Push Setup│ │  SSE   │ │
│  │ Context  │ │ Context  │ │  Listener │ │ Events │ │
│  └────┬─────┘ └────┬─────┘ └─────┬─────┘ └───┬────┘ │
│       └─────────────┴─────────────┴───────────┘      │
│                        │                              │
│  ┌─────────────────────▼──────────────────────────┐  │
│  │            Health / Version Gate                │  │
│  │  MaintenanceScreen │ OfflineScreen │ ForceUpdate│  │
│  └─────────────────────┬──────────────────────────┘  │
│                        │                              │
│  ┌─────────────────────▼──────────────────────────┐  │
│  │              Error Boundary                     │  │
│  │              (CrashScreen)                      │  │
│  └─────────────────────┬──────────────────────────┘  │
│                        │                              │
│  ┌─────────────────────▼──────────────────────────┐  │
│  │             Stack Navigator                     │  │
│  │  ┌──────────────────────────────┐               │  │
│  │  │        Tab Navigator         │               │  │
│  │  │  Home │ Services │ Requests │ Account        │  │
│  │  └──────────────────────────────┘               │  │
│  │  + company/[slug]  + search  + chat/[leadId]    │  │
│  │  + new-request/[slug]  + sign-in  + legal/[slug]│  │
│  │  + notifications  + guided-start  + ...         │  │
│  └────────────────────────────────────────────────┘  │
│                                                       │
│  ┌─────────────────────────────────────────────────┐ │
│  │         Global Modals (always mounted)          │ │
│  │  FeedbackModal │ SiteReviewModal │ GuestPrompt  │ │
│  └─────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
          │                              │
          ▼                              ▼
  ┌──────────────┐            ┌──────────────────┐
  │  apiFetch()  │            │   @alassema/core  │
  │  lib/api.ts  │            │  types · colors   │
  │              │            │  pricing · i18n   │
  └──────┬───────┘            └──────────────────┘
         │
         ▼
  ┌──────────────┐
  │  Backend API │
  │  /api/v1/*   │
  └──────────────┘
```

The app boots through `index.ts` which loads Intl polyfills (required by Hermes for Arabic pluralization), then hands off to Expo Router. The **root layout** (`app/_layout.tsx`) is the orchestration center — it hydrates the session, loads fonts, connects SSE, registers push tokens, checks backend health and app version, and wraps everything in an error boundary before rendering the navigator stack.

---

## Project Structure

```
mobile/client/
├── index.ts                 # Entry point — Intl polyfills → expo-router/entry
├── app.json                 # Expo config (app name, icons, deep links, plugins)
├── eas.json                 # EAS Build profiles (dev, preview, production)
├── package.json             # Dependencies & scripts
├── babel.config.js          # Babel — adds class static block transform for @formatjs
├── metro.config.js          # Metro — React dedup for monorepo compatibility
├── tsconfig.json            # TypeScript strict mode, extends expo base
│
├── app/                     # ── Screens (file-based routing) ──
│   ├── _layout.tsx          # Root layout: providers, health gate, error boundary
│   ├── index.tsx            # Redirect → (tabs)
│   ├── +not-found.tsx       # 404 screen
│   │
│   ├── (tabs)/              # Bottom tab navigator
│   │   ├── _layout.tsx      # Tab bar config (4 tabs, RTL-aware)
│   │   ├── index.tsx        # Home: hero, stats, reviews, categories
│   │   ├── services.tsx     # Service categories listing
│   │   ├── requests.tsx     # My Requests (auth-gated, real-time)
│   │   └── account.tsx      # Account settings, saved companies, language
│   │
│   ├── company/[slug].tsx   # Company profile, offerings, gallery, reviews
│   ├── companies/[slug].tsx # Companies filtered by category
│   ├── services/[slug].tsx  # Service detail with pricing tiers
│   ├── new-request/[slug].tsx # Multi-step lead submission wizard
│   ├── search.tsx           # Full-text search (companies + services)
│   ├── chat/[leadId].tsx    # Real-time messaging per lead
│   ├── notifications.tsx    # Notification center (auth-gated)
│   ├── guided-start.tsx     # Onboarding wizard (property type → service → budget)
│   │
│   ├── sign-in.tsx          # Login + Register (email/password + Google + Apple)
│   ├── forgot-password.tsx  # Password reset request
│   ├── reset-password.tsx   # New password form (deep-linked)
│   ├── verify-email.tsx     # Email verification (deep-linked)
│   │
│   └── legal/[slug].tsx     # Terms, Privacy (markdown from API)
│
├── components/              # ── Reusable UI Components ──
│   ├── Button.tsx           # Primary/secondary/outline/ghost variants
│   ├── TextField.tsx        # Styled input with label + error + RTL
│   ├── Icon.tsx             # Feather icons with RTL flip
│   ├── Logo.tsx             # Brand logo (SVG, multiple sizes)
│   ├── StatusPill.tsx       # Lead status badges
│   ├── AvailabilityBadge.tsx # Company availability indicator
│   ├── OfferingPicker.tsx   # Category → Offering → Tier interactive picker
│   ├── OfferingCard.tsx     # Offering card with price + CTA
│   ├── OfferingGroup.tsx    # Grouped offerings under category header
│   ├── PriceVerificationGate.tsx # Phone OTP wall before revealing prices
│   ├── ReviewsMarquee.tsx   # Auto-scrolling review carousel
│   ├── CompanyGallery.tsx   # Horizontal photo/video gallery
│   ├── MediaLightbox.tsx    # Full-screen viewer (pinch-zoom, swipe-dismiss)
│   ├── Captcha.tsx          # Turnstile CAPTCHA WebView wrapper
│   ├── CaptchaDom.tsx       # HTML generator for Turnstile widget
│   ├── FeedbackModal.tsx    # App feedback (rating + text)
│   ├── SiteReviewModal.tsx  # Platform review modal
│   ├── ReviewModal.tsx      # Company review modal
│   ├── GuestPromptModal.tsx # Auth-gate prompt for guests
│   ├── MenuModal.tsx        # Overflow menu (share, report)
│   ├── CrashScreen.tsx      # Error boundary fallback
│   ├── MaintenanceScreen.tsx # Backend maintenance indicator
│   ├── OfflineScreen.tsx    # No-network indicator
│   ├── UpdateRequiredScreen.tsx # Forced update blocker
│   ├── SoftUpdateBanner.tsx # Non-blocking update suggestion
│   └── ...
│
├── lib/                     # ── Business Logic & Hooks ──
│   ├── api.ts               # HTTP client (apiFetch, retry, error typing)
│   ├── session.ts           # SessionContext (auth state, SecureStore)
│   ├── settings.ts          # SettingsContext (language, notifications, prefs)
│   ├── customerAuth.ts      # Full auth flow (sign in/up, Google, reset, verify)
│   ├── googleAuth.ts        # Google OAuth via expo-auth-session
│   ├── appleAuth.ts         # Sign in with Apple (iOS only, native sheet)
│   ├── authGate.ts          # useAuthGate hook (guards auth-required features)
│   ├── push.ts              # Push notification setup, registration, handlers
│   ├── liveEvents.ts        # SSE connection (lead updates, messages, maintenance)
│   ├── chat.ts              # useChat hook (messages, send, real-time via SSE)
│   ├── customerLeads.ts     # useCustomerLeads (lead list, real-time updates)
│   ├── leads.ts             # useSubmitLead (lead form submission)
│   ├── leadTokens.ts        # Anonymous lead tracking tokens for guests
│   ├── pricing.ts           # usePricing hook (wraps @alassema/core engine)
│   ├── search.ts            # useSearch (debounced, recent searches in AsyncStorage)
│   ├── companies.ts         # useCompanies (by category)
│   ├── companyDetail.ts     # useCompanyDetail (full profile)
│   ├── offerings.ts         # useOfferings (company offerings)
│   ├── categories.ts        # useCategories
│   ├── saved.ts             # useSaved (bookmarks — server + local guest fallback)
│   ├── reviews.ts           # useReviews
│   ├── projects.ts          # useProjects (company portfolio)
│   ├── notifications.ts     # useNotifications
│   ├── feedback.ts          # useSubmitFeedback
│   ├── siteReviews.ts       # useSubmitSiteReview
│   ├── waitlist.ts          # useJoinWaitlist
│   ├── pages.ts             # usePages (legal/static content)
│   ├── captcha.ts           # useCaptcha (Turnstile lifecycle)
│   ├── rtl.ts               # useRTL (direction, style helpers, icon flip)
│   ├── fonts.ts             # Font loading config (Cairo + Alexandria)
│   ├── assetUrl.ts          # Root-relative → absolute URL resolver
│   ├── appVersion.ts        # useAppVersion (forced/soft update detection)
│   ├── useBackendHealth.ts  # Backend health polling (30s interval)
│   ├── useRefreshOnFocus.ts # Re-fetch data on screen focus
│   └── useCountUp.ts        # Animated counter for home stats
│
├── assets/                  # ── Static Assets ──
│   ├── icon.png             # iOS app icon
│   ├── android-icon-*.png   # Android adaptive icon (foreground, background, mono)
│   ├── splash-icon.png      # Splash screen icon
│   ├── favicon.png          # Web favicon
│   ├── logo-default.png     # Fallback company logo
│   ├── hero-skyline.jpg     # Home screen hero background
│   └── hero-tower.jpg       # Alternative hero image
│
└── scripts/
    └── sync-lan-ip.js       # Auto-detects LAN IP → updates .env for physical devices
```

---

## Navigation & Routing

The app uses **Expo Router 6** (file-based routing on top of React Navigation).

### Navigator Hierarchy

```
Stack Navigator (Root)
├── Tab Navigator "(tabs)"
│   ├── Home          →  (tabs)/index.tsx
│   ├── Services      →  (tabs)/services.tsx
│   ├── My Requests   →  (tabs)/requests.tsx    [auth-gated]
│   └── Account       →  (tabs)/account.tsx
│
├── company/[slug]        Company profile
├── companies/[slug]      Companies by category
├── services/[slug]       Service detail
├── new-request/[slug]    Lead submission wizard
├── search                Full-text search
├── chat/[leadId]         Chat per lead            [auth-gated]
├── notifications         Notification center       [auth-gated]
├── guided-start          Onboarding wizard
├── sign-in               Login / Register
├── forgot-password       Password reset request
├── reset-password        New password (deep-linked)
├── verify-email          Email verification (deep-linked)
├── legal/[slug]          Terms, Privacy (markdown)
└── +not-found            404
```

### Deep Links

| URL Pattern | Screen |
|------------|--------|
| `alassema://` | App root |
| `https://alassema.com/requests/*` | My Requests |
| `https://alassema.com/messages/*` | Chat |
| `https://alassema.com/companies/*` | Company profile |
| `https://alassema.com/verify-email?token=*` | Email verification |
| `https://alassema.com/reset-password?token=*` | Password reset |
| `https://alassema.com/account/*` | Account |

Configured via `app.json` — iOS Associated Domains (`applinks:alassema.com`) and Android intent filters with `autoVerify: true`.

---

## Screens Reference

### Tab Screens

| Tab | Icon | Description |
|-----|------|-------------|
| **Home** | `home` | Hero with animated gradient overlay, animated stats counters (companies, projects, clients), auto-scrolling reviews marquee, category grid, "How it works" section, guided-start CTA. Pull-to-refresh. |
| **Services** | `grid` | Lists all service categories with AR/EN names, descriptions, and icons. Tapping navigates to company listing for that category. |
| **My Requests** | `file-text` | Auth-gated. Lists submitted leads with status pills, company info, dates, quoted prices. Tapping opens chat. Real-time updates via SSE. Badge shows unread count. |
| **Account** | `user` | Guest: sign-in/register CTA. Logged-in: profile info, saved companies, language toggle (AR↔EN), notification prefs, legal links, feedback button, logout, app version. |

### Key Flows

**Service Discovery → Lead Submission:**
`Home/Services → companies/[slug] → company/[slug] → new-request/[slug] → (confirmation)`

**Onboarding:**
`guided-start → (property type → service → budget → location) → matching companies`

**Lead Lifecycle:**
`new-request → My Requests (status tracking) → chat/[leadId] (messaging)`

**Authentication:**
`sign-in (email/password or Google) → verify-email → (authenticated)`
`forgot-password → reset-password (deep-linked from email)`

---

## State Management

The app uses **no external state management library** (no Redux, Zustand, or MobX). All state is managed through React primitives:

| Pattern | Usage | Persistence |
|---------|-------|-------------|
| **React Context** | `SessionContext` (auth), `SettingsContext` (prefs) | SecureStore / AsyncStorage |
| **Custom Hooks** | Every data concern (`useCompanies`, `useChat`, `useCustomerLeads`, etc.) | In-memory (re-fetched on mount/focus) |
| **`useState` + `useEffect`** | Loading, error, data states inside hooks | Transient |
| **AsyncStorage** | Non-sensitive data (settings, recent searches, guest bookmarks) | On-device |
| **SecureStore** | Auth token | Encrypted on-device |

### Data Freshness

- **`useRefreshOnFocus`**: Screens re-fetch data when focused (returning from background or navigating back).
- **SSE events**: Leads and chat messages update in real-time without manual refresh.
- **Pull-to-refresh**: All list screens support manual refresh.

---

## API Layer

Centralized in `lib/api.ts`. All HTTP communication goes through a single `apiFetch` function.

### Request Pipeline

```
Screen Hook (e.g. useCompanies)
  → api.get("/companies?category=finishing")
    → apiFetch(url, options)
      → Inject headers:
         Authorization: Bearer <token>
         X-Api-Key: <key>       (if configured)
         Accept-Language: ar|en
         Content-Type: application/json  (POST/PUT/PATCH)
      → fetch(EXPO_PUBLIC_API_URL + path, options)
      → Error handling:
         401 → token refresh (single retry, then logout)
         429 → rate limited error
         503 → maintenance mode
         5xx → automatic retry (2 attempts, exponential backoff, GET only)
         Network failure → NetworkError
      → Parse JSON → return typed data
```

### Error Types

- **`ApiError`**: Structured error from the backend — includes `status`, `code`, `message`.
- **`NetworkError`**: Device offline or request couldn't reach the server.

---

## Authentication

### Supported Methods

1. **Email / Password** — standard sign-in and registration with phone number collection.
2. **Google Sign-In** — OAuth 2.0 via `expo-auth-session` with platform-specific client IDs (Web, iOS, Android).
3. **Sign in with Apple** — native sheet via `expo-apple-authentication`, iOS only. Not optional: App Store guideline 4.8 requires it in any app that offers Google sign-in, so an iOS build without it is rejected.

Both providers land on the same backend contract (`signInWithIdentity`), but Apple differs in three ways that shape the code — see `lib/appleAuth.ts` and the server's `appleIdentity.service.ts`:

| | Google | Apple |
|---|---|---|
| Name / avatar | in every ID token | **never** in the token; the name reaches the client once, on first authorization, and is gone forever after |
| Email | the real address | may be a `@privaterelay.appleid.com` relay (mail to it bounces unless the sending domain is registered with Apple) |
| `email_verified` | boolean | boolean **or** the string `"true"` |

Because Apple has no client id to check, the button's visibility is a native device check rather than a config flag — which means it appears even when the server has `APPLE_CLIENT_IDS` unset. Configure the server before shipping an iOS build. Apple sign-in also cannot be exercised in Expo Go; the entitlement only exists in a development or production build.

### Auth Flow

```
┌──────────┐     ┌────────────┐     ┌──────────┐
│  Guest   │────▶│  Sign In   │────▶│ Authed   │
│  Mode    │     │  Screen    │     │ Session  │
└──────────┘     └──────┬─────┘     └──────────┘
                        │
          ┌─────────────┼─────────────┐
          ▼             ▼             ▼
   Email/Password   Google OAuth  Register
          │             │             │
          └─────────────┼─────────────┘
                        ▼
               Backend validates
               Returns JWT token
                        │
                        ▼
               Token → SecureStore
               User → SessionContext
               Push token registered
               SSE connected
```

### Guest Mode

Users can browse the entire catalogue without an account. Auth-gated features (My Requests, Chat, Notifications, saving companies) display a `GuestPromptModal` with options to sign in, register, or continue browsing.

### Token Management

- **Storage**: JWT stored in `expo-secure-store` (hardware-backed encryption on iOS, encrypted shared preferences on Android).
- **Hydration**: On cold start, token is read from SecureStore and validated via `GET /me`.
- **Refresh**: On 401 response, a single token-refresh attempt is made. If it fails, the user is logged out.
- **Logout**: Clears SecureStore, unregisters push token, disconnects SSE, resets session to guest.

---

## Real-time Features

### Server-Sent Events (SSE)

The app maintains a persistent SSE connection to `GET /events/stream` for real-time data.

| Event | Trigger | Effect |
|-------|---------|--------|
| `lead:updated` | Lead status change, price quote | Updates lead data in `useCustomerLeads` without re-fetch |
| `lead:message` | New chat message | Appends message in `useChat`, updates unread badge |
| `notification:new` | Any notification | Updates notification list |
| `maintenance:on/off` | Backend status toggle | Shows/hides `MaintenanceScreen` |

**Connection lifecycle:**
- Connects when user is authenticated **and** app is foregrounded.
- Disconnects on background (via `AppState` listener) to preserve battery.
- Auto-reconnects with exponential backoff: 1s → 2s → 4s → … → 30s max.
- Resets backoff on successful connection.

---

## Push Notifications

Built on `expo-notifications` for unified FCM (Android) + APNs (iOS) delivery.

| Concern | Implementation |
|---------|---------------|
| **Permission** | Requested on first login via `usePushSetup` |
| **Token** | Expo push token registered with backend (`POST /customers/me/push-token`) |
| **Unregister** | On logout (`DELETE /customers/me/push-token`) |
| **Foreground** | In-app alert-style notification |
| **Background tap** | Deep-links to relevant screen (e.g., lead update → chat) |
| **Android channel** | "Al Assema" channel, default importance, brand color `#005578` |
| **Dedup** | Token stored locally; skips re-registration if unchanged |

---

## RTL & Internationalization

The app is **Arabic-first** with full English support, switchable at runtime from the Account tab.

| Feature | Implementation |
|---------|---------------|
| **Layout direction** | `I18nManager.forceRTL()` — requires app restart for full effect |
| **Style helpers** | `useRTL` hook provides `flexRow`, `textAlign`, `marginStart`, `marginEnd`, etc. |
| **Icon flipping** | Directional icons (arrows, chevrons) auto-flip in RTL |
| **Fonts** | Cairo for Arabic text, Alexandria for UI elements |
| **API** | `Accept-Language` header sent with every request; backend returns localized content |
| **Pluralization** | Arabic 6-form plurals via `@alassema/core` using `Intl.PluralRules` (polyfilled on Hermes) |
| **Number/Currency** | Locale-aware formatting via `@alassema/core` (EGP currency) |

---

## Security

| Concern | Measure |
|---------|---------|
| **Token storage** | `expo-secure-store` — hardware-encrypted, NOT AsyncStorage |
| **CAPTCHA** | Cloudflare Turnstile on lead submission, feedback, and reviews (WebView-rendered) |
| **Price gating** | Phone OTP verification required before revealing full pricing (`PriceVerificationGate`) |
| **API key** | Optional shared `X-Api-Key` header (for future use) |
| **401 handling** | Single refresh retry, then forced logout — prevents stale token usage |
| **Secrets in source** | `.env` gitignored; only `.env.example` committed; EAS injects prod values at build time |
| **Google OAuth** | Client IDs are public identifiers (per Google's design); no client secrets in the app binary |
| **Deep link validation** | Android `autoVerify: true`, iOS Associated Domains — prevents URL hijacking |

---

## Resilience & Error Handling

The app implements multiple layers of fault tolerance:

```
Layer 1: Error Boundary (CrashScreen)
  └─ Catches unhandled JS exceptions
  └─ Shows branded error screen with retry button

Layer 2: Backend Health Gate (MaintenanceScreen / OfflineScreen)
  └─ Polls /health every 30 seconds
  └─ 503 → MaintenanceScreen (branded, auto-retries)
  └─ Network failure → OfflineScreen (retry button)

Layer 3: Version Gate (UpdateRequiredScreen / SoftUpdateBanner)
  └─ Checks /version endpoint on launch
  └─ Breaking version → blocks app with store link
  └─ Recommended update → non-blocking banner

Layer 4: API-level Retry
  └─ GET requests: 2 retries with exponential backoff on 5xx/network errors
  └─ Non-GET requests: no retry (prevents duplicate mutations)

Layer 5: SSE Reconnection
  └─ Exponential backoff: 1s → 30s max
  └─ Auto-reconnects on network restoration
```

---

## Shared Core Package

**`@alassema/core`** (`packages/core/`) is a platform-agnostic TypeScript package consumed by mobile, web, and API.

| Module | Exports |
|--------|---------|
| **`apiTypes.ts`** | DTOs: `ApiCompany`, `ApiLead`, `ApiOffering`, `ApiReview`, `ApiProject`, `ApiCategory`, `ApiAuthResponse`, etc. |
| **`theme.ts`** | 53 Material 3 color tokens + React Native typography scale (caption → display) |
| **`districts.ts`** | New Administrative Capital zone constants (R7, R8, CBD, Diplomatic Quarter, etc.) |
| **`locale.ts`** | `Locale` type (`"en" | "ar"`) |
| **`phone.ts`** | E.164 formatting, validation, display (Egypt default) |
| **`plural.ts`** | Arabic 6-form + English pluralization via `Intl.PluralRules` |

**Design principles:**
- **Zero platform dependencies** — no React, no DOM, no Node built-ins. Pure TypeScript.
- **Source-linked** — `main` points at `src/index.ts` (no build step). Metro/Vite/Next.js compile it directly.
- **Single source of truth** — prevents type drift between frontend and backend.

---

## Environment Variables

Copy `.env.example` → `.env` and fill in:

| Variable | Purpose | Example |
|----------|---------|---------|
| `EXPO_PUBLIC_API_URL` | Backend API base URL | `https://alassema.com/api/v1` |
| `EXPO_PUBLIC_ASSET_URL` | Media origin override (local dev only) | `http://192.168.1.5:5173` |
| `EXPO_PUBLIC_GOOGLE_CLIENT_ID` | Google OAuth — Web client ID | `592484560089-...` |
| `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` | Google OAuth — iOS client ID | `592484560089-...` |
| `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID` | Google OAuth — Android client ID | `592484560089-...` |
| `EXPO_PUBLIC_TURNSTILE_SITE_KEY` | Cloudflare Turnstile site key | `0x4AAAAAA...` |
| `EXPO_PUBLIC_API_KEY` | Optional shared API key | (blank unless server is configured) |

> **Note:** All `EXPO_PUBLIC_*` variables are **bundled into the JS binary** at build time. None of them should contain secrets. The Google client IDs and Turnstile site key are public identifiers by design.

---

## Local Development

### Prerequisites

- Node.js 22+
- Expo Go app on a physical device (or an Android/iOS emulator)
- Backend running locally (`npm run dev:api` from repo root → `http://localhost:3000`)
- Web frontend for asset serving (`npm run dev:app:lan` from repo root → `http://<LAN_IP>:5173`)

### Setup

```bash
# From mobile/client/
npm install

# Copy environment template
cp .env.example .env
# The sync-lan-ip script will auto-fill your LAN IP on first run
```

### Running

```bash
npm start          # Opens Expo dev tools (scan QR with Expo Go)
npm run android    # Launch on Android device/emulator
npm run ios        # Launch on iOS simulator/device
npm run web        # Launch web version (development only)
```

### LAN IP Auto-sync

The `sync-lan-ip.js` script runs automatically before every start command (`prestart`, `preandroid`, `preios`, `preweb`). It:

1. Detects your machine's LAN IP from active network interfaces (filters out Docker/WSL/VPN adapters).
2. Updates `EXPO_PUBLIC_API_URL` and `EXPO_PUBLIC_ASSET_URL` in `.env` with the current IP.
3. Preserves custom ports and paths.

This solves the common issue where phone devices can't reach `localhost` on the development machine, and handles dynamic IP changes from Wi-Fi reconnections.

### Type Checking

```bash
npm run typecheck       # tsc --noEmit
npm run bundle:check    # Verify the web bundle compiles
```

---

## Build & Release Pipeline

The app uses **EAS Build** for cloud-native builds and **EAS Submit** for store distribution.

### Build Profiles (`eas.json`)

| Profile | Purpose | Distribution | Channel | Auto-increment |
|---------|---------|-------------|---------|----------------|
| **`development`** | Dev client for physical devices | Internal | — | No |
| **`preview`** | Team testing (QA) | Internal | `preview` | No |
| **`production`** | Store release | Store | `production` | Yes |

### Build Commands

```bash
# Install EAS CLI
npm install -g eas-cli

# Development build (internal testing)
eas build --profile development --platform android
eas build --profile development --platform ios

# Preview build (internal QA distribution)
eas build --profile preview --platform android
eas build --profile preview --platform ios

# Production build (store release)
eas build --profile production --platform android
eas build --profile production --platform ios

# Submit to stores
eas submit --platform android
eas submit --platform ios
```

### Store Identifiers

| Platform | Identifier |
|----------|-----------|
| iOS Bundle ID | `com.alassema.client` |
| Android Package | `com.alassema.client` |
| App Name | Al Assema |
| EAS Project ID | `ed93c3b0-fbd6-48ed-be32-c9312e4e5d47` |

### Environment Injection

Production environment variables are configured in `eas.json` per build profile — they are injected at build time, not read from `.env`.

---

## OTA Updates

The app supports **over-the-air JavaScript updates** via `expo-updates`, avoiding full store resubmission for non-native changes.

| Setting | Value |
|---------|-------|
| Runtime version policy | `appVersion` (tied to `version` in `app.json`) |
| Update URL | `https://u.expo.dev/ed93c3b0-fbd6-48ed-be32-c9312e4e5d47` |
| Channels | `preview`, `production` |

### Update Behavior

- **`UpdateRequiredScreen`**: If the backend reports a minimum required version higher than the running version, the app blocks usage and links to the store.
- **`SoftUpdateBanner`**: If a newer recommended version is available, a non-blocking banner suggests updating.
- OTA updates are checked on app launch and applied on next cold start.

---

## Key Technical Decisions

### Why Polyfills in `index.ts`?

Hermes (React Native's JS engine) ships without `Intl.PluralRules`. The `@alassema/core` package constructs `new Intl.PluralRules(...)` at **module load time** for Arabic pluralization. Without the polyfill, the app crashes on the very first import — every route imports `@alassema/core` for colors/types, so the failure cascades into a blank app. The polyfills must run before any other import.

### Why Custom Metro `resolveRequest`?

In an npm workspaces monorepo, hoisting can create duplicate `react` copies at different filesystem paths. Even if they're the same version, two physical copies break React's hooks dispatcher singleton. The custom resolver forces all `react`, `react-dom`, and `scheduler` imports to resolve to `mobile/client/node_modules/`, preventing the "Invalid hook call" error.

### Why Babel `class-static-block` Plugin?

`@formatjs/intl-pluralrules` ships modern syntax (class static blocks) that `babel-preset-expo` doesn't transform for `node_modules`. Hermes can't parse it either. The explicit plugin ensures the transform happens at build time.

### Why WebView for CAPTCHA?

Cloudflare Turnstile is a web-only widget (DOM + JavaScript challenge). Since React Native has no DOM, the widget is rendered inside a `react-native-webview`. The WebView loads a minimal HTML page with the Turnstile script, completes the challenge, and sends the token back to React Native via `postMessage`.

### Why SSE Instead of WebSocket?

SSE is simpler to implement server-side (standard HTTP, works through most proxies/CDNs), requires no special connection upgrade, and aligns with the unidirectional data flow (server → client). The app only needs to *receive* updates; sending data goes through regular API calls.

---

## Component Library

### Primitives

| Component | Description |
|-----------|-------------|
| `Button` | Primary, secondary, outline, ghost variants. Loading spinner, disabled state. |
| `TextField` | Styled input with floating label, error message, RTL support, secure entry toggle. |
| `Icon` | Feather icon wrapper. Auto-flips directional icons in RTL. |
| `Logo` | Al Assema SVG logo. Supports multiple sizes. |
| `StatusPill` | Colored badge: `pending` (amber), `quoted` (blue), `accepted` (green), `completed` (teal), `cancelled` (red). |
| `AvailabilityBadge` | Company availability: available (green), busy (amber), unavailable (grey). |
| `WaitlistStatusPill` | Waitlist position indicator. |

### Domain Components

| Component | Description |
|-----------|-------------|
| `OfferingPicker` | Multi-level interactive picker: Category → Offering → Tier. Shows pricing and inclusions/exclusions. |
| `OfferingCard` | Card for a single offering: name, description, price range, request CTA. |
| `OfferingGroup` | Expandable/collapsible group of related offerings. |
| `PriceVerificationGate` | Phone OTP wall. User enters phone → receives OTP → verifies → pricing unlocked. |
| `ReviewsMarquee` | Auto-scrolling horizontal review carousel with smooth animation. |
| `CompanyGallery` | Horizontal scrollable gallery with thumbnail previews. |
| `MediaLightbox` | Full-screen media viewer with pinch-to-zoom and swipe-to-dismiss. |
| `Captcha` | Turnstile CAPTCHA rendered in WebView. Invisible to user; fires callback on success. |

### System Screens

| Component | Trigger |
|-----------|---------|
| `CrashScreen` | Unhandled JS exception (error boundary) |
| `MaintenanceScreen` | Backend `/health` returns 503 |
| `OfflineScreen` | Network request fails entirely |
| `UpdateRequiredScreen` | App version below minimum required |
| `SoftUpdateBanner` | Newer version available (non-blocking) |

### Modals

| Component | Description |
|-----------|-------------|
| `GuestPromptModal` | Shown when guests access auth-gated features. Options: Sign In, Register, Continue. |
| `FeedbackModal` | App feedback form (star rating + free text). |
| `SiteReviewModal` | Platform review submission. |
| `ReviewModal` | Company review viewer/submission. |
| `MenuModal` | Overflow actions (share, report). |

---

## License

See [`LICENSE`](./LICENSE).
