# AL ASIMA — Business Control Center (desktop)

Internal desktop app for Al Asima staff: finance, clients, providers, pricing
intelligence, operations. Talks ONLY to the existing `api/` over HTTPS with a
Bearer token — no database credentials, no Prisma, no Supabase service-role
key ever live in this app. See `../CLAUDE.md` and the architecture doc for the
full design rationale; this file is just local setup.

## Stack

- [Tauri 2](https://tauri.app) (Rust shell) + Vite + React 19 + TypeScript + Tailwind
- Auth: `Authorization: Bearer <token>` against `api/`'s existing JWT auth
  (`api/src/lib/auth.ts`'s Bearer path). The token lives in the OS credential
  vault (Windows Credential Manager / macOS Keychain / Linux Secret Service)
  via `src-tauri/src/auth.rs` — never in localStorage.
- API calls go through `@tauri-apps/plugin-http` (Rust-side `reqwest`), not the
  webview's own `fetch` — see `src-tauri/Cargo.toml`'s comment for why (no CORS
  changes needed on the existing Next.js API).

## Prerequisites

Follow Tauri's own prerequisites guide for your OS — https://tauri.app/start/prerequisites/.
In short:

- Node.js (matching the rest of this monorepo — see the root `.node-version`)
- Rust (`rustup`) — stable toolchain
- **Windows**: WebView2 (preinstalled on Windows 10 21H2+ / Windows 11; the
  installer bundles it anyway for older systems) + the "Desktop development
  with C++" workload from Visual Studio Build Tools
- **macOS**: Xcode Command Line Tools
- **Linux**: `webkit2gtk`, `librsvg2`, `libayatana-appindicator3` — see the
  Tauri prerequisites page for your distro's exact package names

## Setup

```bash
cd desktop
npm install
cp .env.example .env.local
# edit .env.local — VITE_API_URL must be an ABSOLUTE url (see .env.example's
# comment on why this differs from app/.env.example's same-origin "/api")
```

Also update `src-tauri/capabilities/default.json`'s `http:default` scope with
your real API domain once one exists — it currently only allow-lists
`localhost:3000` and the placeholder `your-domain.com` from
`../deploy/Caddyfile`. A request to any origin NOT in that list is rejected
before it leaves the app, by design.

## Run (dev)

Make sure `api/` is running first (`cd ../api && npm run dev`), then:

```bash
npm run tauri dev
```

## Build an installer

```bash
npm run tauri build
```

Windows → NSIS/MSI installer under `src-tauri/target/release/bundle/`.

## Project layout

```
src/
  lib/
    api.ts          fetch wrapper (Bearer auth, plugin-http)
    apiTypes.ts      copy of api/src/lib/apiTypes.ts — keep in sync by hand
    auth.tsx         AuthContext + ProtectedRoute (role + desktopPermissions gate)
    secureToken.ts   thin wrapper around the 3 Rust auth commands
    permissions.ts   DESKTOP_PERMISSIONS mirror (client-side UX only — the
                     server's desktopOnly() is the real boundary)
    navConfig.ts     sidebar structure (source of truth for both Sidebar and router)
    dateRange.tsx    Today/This Week/This Month/Custom period selector
  components/
    shell/           Sidebar, Header, AppShell, PageHeader
    states/          Loading/Error/Empty/NoDataForPeriod
  pages/             one file per screen
src-tauri/
  src/auth.rs        OS credential vault commands (store/get/clear token)
  src/lib.rs         Tauri builder — registers auth.rs commands + http plugin
  capabilities/      permission grants, including the http scope allow-list
```

## Status

Implemented: app shell (sidebar/header/states), auth + permission gating,
Overview screen (real data from `GET /admin/desktop/overview`). Every other
sidebar destination renders `PlaceholderPage` until its stage — see the
phased implementation plan.
