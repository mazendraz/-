# Al Assema — Frontend Documentation

> **Al Assema** (العاصمة) is a curated digital marketplace for Egypt's New
> Administrative Capital (NAC). Customers browse manually-vetted service
> companies, compare them, save shortlists, and submit service requests — with
> **no account or login required**. Admins and providers manage the catalog and
> incoming leads through dedicated dashboards.

This document describes the **frontend** of the app under [app/](.) — the React
single-page application that powers the entire experience. There is no separate
backend: all data is persisted client-side in `localStorage` (see
[State & data layer](#5-state--data-layer)).

---

## 1. Tech stack

| Concern            | Choice                                            |
| ------------------ | ------------------------------------------------- |
| Framework          | **React 18** (`react`, `react-dom` 18.3)          |
| Language           | **TypeScript 5.6** (strict mode)                  |
| Build tool         | **Vite 5** (`@vitejs/plugin-react`)               |
| Routing            | **React Router 6** (`createBrowserRouter`)        |
| Styling            | **Tailwind CSS 3.4** + custom CSS in `index.css`  |
| Icons              | **Google Material Symbols Outlined** (web font)   |
| Fonts              | **Plus Jakarta Sans** (display) + **Inter** (body)|
| Persistence        | Browser `localStorage` + custom events            |
| State management   | React hooks + a custom localStorage-backed store  |

There are **no external state libraries** (Redux/Zustand), **no data-fetching
libraries**, and **no UI component libraries**. Everything is hand-built.

### Scripts

```bash
npm install
npm run dev      # Vite dev server → http://localhost:5173 (auto-opens)
npm run build    # tsc -b type-check, then production build → dist/
npm run preview  # serve the production build locally
```

Config files: [vite.config.ts](vite.config.ts), [tsconfig.json](tsconfig.json),
[tailwind.config.js](tailwind.config.js), [postcss.config.js](postcss.config.js).
The HTML shell ([index.html](index.html)) preloads the Google Fonts and the
Material Symbols font, and mounts the app at `#root`.

---

## 2. Project structure

```
app/
├── index.html                # HTML shell, font preloads, #root mount
├── public/
│   └── logo.png              # Brand logo (referenced as /logo.png)
├── src/
│   ├── main.tsx              # Entry point — router definition + render
│   ├── RootLayout.tsx        # Shared chrome (nav/footer/overlays) for public pages
│   ├── index.css             # Tailwind layers + all custom CSS/animations
│   │
│   ├── pages/                # One component per route
│   │   ├── Home.tsx
│   │   ├── Services.tsx
│   │   ├── ServiceCategory.tsx
│   │   ├── Companies.tsx
│   │   ├── CompanyProfile.tsx
│   │   ├── GuidedStart.tsx
│   │   ├── Compare.tsx
│   │   ├── Saved.tsx
│   │   ├── RequestForm.tsx
│   │   ├── MyRequests.tsx
│   │   ├── NotFound.tsx
│   │   ├── AdminDashboard.tsx
│   │   └── ProviderDashboard.tsx
│   │
│   ├── components/           # Reusable presentational + layout components
│   │   ├── TopNav.tsx
│   │   ├── Footer.tsx
│   │   ├── SearchOverlay.tsx
│   │   ├── SearchInput.tsx
│   │   ├── CompareBar.tsx
│   │   ├── SaveButton.tsx
│   │   ├── PersonalTabs.tsx
│   │   ├── LazyImage.tsx
│   │   ├── ScrollProgress.tsx
│   │   └── Charts.tsx        # SVG/CSS chart primitives for dashboards
│   │
│   ├── hooks/                # Custom React hooks
│   │   ├── useSaved.ts
│   │   ├── useCompare.ts
│   │   ├── useCountUp.ts
│   │   └── useSearch.ts
│   │
│   └── lib/                  # Data, persistence, and pure logic
│       ├── data.ts           # Seed catalog + types + featured content
│       ├── catalog.ts        # Live, editable catalog store (companies/categories)
│       ├── requests.ts       # Leads (service requests) store
│       ├── search.ts         # Universal client-side search
│       ├── analytics.ts      # Lead aggregations for dashboard charts
│       ├── demo.ts           # Sample-lead generator (admin "Load demo data")
│       └── image.ts          # Client-side image resize/compress to data URLs
```

---

## 3. Routing

All routes are defined in [main.tsx](src/main.tsx) with `createBrowserRouter`.
There are **two route groups**:

### Public pages — wrapped in `RootLayout`
These share the top nav, footer, scroll-progress bar, search overlay, and
compare bar.

| Route                  | Component         | Purpose                                              |
| ---------------------- | ----------------- | ---------------------------------------------------- |
| `/`                    | `Home`            | Landing page — hero, stats, services, companies, projects, reviews, CTA |
| `/services`            | `Services`        | Grid of all service categories (searchable)          |
| `/services/:category`  | `ServiceCategory` | Companies within one category (searchable list)      |
| `/companies`           | `Companies`       | All companies, with filter/sort/search + compare     |
| `/companies/:slug`     | `CompanyProfile`  | Single company — tabs: Overview/Projects/Reviews/Gallery |
| `/start`               | `GuidedStart`     | 3-step quiz → matched company shortlist              |
| `/compare`             | `Compare`         | Side-by-side comparison table (up to 3 companies)    |
| `/saved`               | `Saved`           | Saved/shortlisted companies (this device)            |
| `/requests`            | `MyRequests`      | Requests submitted from this device, with status     |
| `/request`            | `RequestForm`     | Submit a service request (reads `?company=&companyName=&service=`) |
| `*`                    | `NotFound`        | 404 — keeps chrome so users can navigate out         |

### Internal dashboards — standalone (no public chrome)

| Route        | Component           | Purpose                                                       |
| ------------ | ------------------- | ------------------------------------------------------------- |
| `/admin`     | `AdminDashboard`    | Operations console — leads, companies CRUD, categories, analytics, settings |
| `/provider`  | `ProviderDashboard` | Per-company partner portal — leads, projects, reviews, analytics, profile |

> **Note:** The README mentions older routes (`/partners`, `/projects`,
> `/login`). The live router above is authoritative.

### Layout behavior ([RootLayout.tsx](src/RootLayout.tsx))
- Renders `ScrollProgress`, `TopNav`, the routed `<Outlet>`, `Footer`,
  `CompareBar`, and `SearchOverlay`.
- On every route change, `window.scrollTo(top)` resets scroll position.
- The `<main>` element is keyed by `pathname`, forcing a remount so the
  `page-enter` CSS animation re-fires on each navigation.
- Exposes `openSearch` to all child pages via React Router's
  `Outlet context` (consumed through the `useSearchOverlay` hook).

---

## 4. Pages in detail

### Home ([Home.tsx](src/pages/Home.tsx))
Full marketing landing page. Sections: full-screen NAC skyline **hero** (with a
search trigger that opens the global overlay), animated **stat counters**
(`useCountUp` + `IntersectionObserver`), a **guided-flow banner** linking to
`/start`, **Featured Services**, **Featured Companies** (`featured !== false`),
a **Featured Projects** bento grid, **Why Al Assema**, **Reviews**, and a final
**CTA**. Uses an internal `useReveal` hook for scroll-triggered fade-ups and
mobile horizontal scroll (`mobile-scroll`) that becomes a grid on desktop.

### Services ([Services.tsx](src/pages/Services.tsx))
Searchable card grid of all service categories from `useCategoriesWithCounts()`.
Client-side filter by label/description.

### ServiceCategory ([ServiceCategory.tsx](src/pages/ServiceCategory.tsx))
Lists companies in `:category`. Falls back to all companies if the category is
empty/unmatched. Searchable across name/tagline/category/services. Renders rich
horizontal `CompanyRow` cards.

### Companies ([Companies.tsx](src/pages/Companies.tsx))
The main directory. Features:
- **Sticky filter bar**: text search, category chips, minimum-rating select,
  and sort (Recommended / Top Rated / Most Projects / Most Reviews / Name).
- Desktop shows inline controls; mobile uses a bottom-sheet **filter modal**.
- Removable **active-filter chips** + result count.
- Each `CompanyCard` has a **Save** heart (top-right) and a **Compare** toggle
  (top-left), with compare capped at `COMPARE_MAX` (3).

### CompanyProfile ([CompanyProfile.tsx](src/pages/CompanyProfile.tsx))
Single company by `:slug`. Cover hero + identity bar (rating, trust pills),
four tabs:
- **Overview** — about, services, recent projects, sidebar with credentials,
  quick stats, CTA card, and contact.
- **Projects** — full project grid.
- **Reviews** — aggregate rating + review cards.
- **Gallery** — image grid with a click-to-zoom **lightbox**.

Has a desktop **Request a Service** CTA and a mobile **sticky bottom CTA bar**.
Request links carry `?company=<slug>&companyName=<name>` into the form.

### GuidedStart ([GuidedStart.tsx](src/pages/GuidedStart.tsx))
A 3-step matcher: (1) pick a category, (2) pick a priority
(quality/experience/trust), (3) see a ranked top-3 shortlist with a "Best match"
ribbon. Pure client-side ranking; no submission.

### Compare ([Compare.tsx](src/pages/Compare.tsx))
Side-by-side table of the companies in the compare set (rating, reviews,
projects, experience, response time, verified-since, credentials, services).
Highlights the "best" company per numeric row. Empty state prompts browsing.

### Saved ([Saved.tsx](src/pages/Saved.tsx))
Shortlisted companies for this device (`useSaved`). Searchable; each row has a
Save toggle and a Request shortcut. Shares the `PersonalTabs` control with
`MyRequests`.

### RequestForm ([RequestForm.tsx](src/pages/RequestForm.tsx))
The core conversion flow. A single-screen form (name, phone, optional service,
district, budget, description) with:
- **Smart pre-fill** from this device's last request.
- Inline **validation** (`validate()`), error shake animation, scroll-to-error.
- A 700 ms artificial delay for submit polish, then `addLead(...)`.
- A **success screen** showing the generated reference number (e.g. `AA-20240610-X4K2`)
  and a summary. No account is created — the lead is tied to the device.

### MyRequests ([MyRequests.tsx](src/pages/MyRequests.tsx))
Tracks leads submitted from this device (`useMyLeads`). Search + status-filter
chips; each request card shows company, service, status badge, reference,
submission date, district, and budget.

### NotFound ([NotFound.tsx](src/pages/NotFound.tsx))
Friendly 404 with links back to Home / Companies.

### AdminDashboard ([AdminDashboard.tsx](src/pages/AdminDashboard.tsx)) — ~1,000 LOC
The operations console. Sidebar (desktop rail / mobile drawer) with tabs:
- **Overview** — KPI cards (total/new leads, conversion, companies), leads-over-time
  area chart, status donut, conversion funnel, top-companies bar list, company
  leaderboard, recent activity. Shows a "Load demo data" empty state.
- **Leads** — searchable/filterable; desktop **table**, mobile **cards**; click
  opens a **lead detail modal** (change status, delete).
- **Companies** — list with lead counts; **CompanyEditor** modal (full CRUD):
  details, image/logo/cover/gallery uploads (compressed to data URLs), tag
  inputs for services & badges, plus sub-editors for **projects** and **reviews**.
- **Services** — category CRUD via **CategoryEditor** (label, Material icon,
  description, cover).
- **Settings** — load/clear demo leads, **export/import** catalog JSON, and
  **reset catalog** to seed defaults.

Includes many shared sub-components: `ModalShell`, `LField`, `TagField`,
`ImageUpload`, `GalleryUpload`, `ConfirmDelete`, `ConfirmAction`, `LeadTable`,
`LeadMobileCard`, `LeadModal`.

### ProviderDashboard ([ProviderDashboard.tsx](src/pages/ProviderDashboard.tsx))
A per-company partner portal (selected via `?company=` or a sidebar dropdown).
Tabs: **Overview** (KPIs + charts + recent leads), **Leads** (search/filter +
inline status change), **Projects**, **Reviews** (search + rating filter),
**Analytics** (trend, status donut, funnel, monthly bars), **Profile**, and
**Settings** (notification toggles — UI only; profile is admin-managed).

---

## 5. State & data layer

There is no server. All dynamic data lives in `localStorage` and is made
**reactive across the app and across browser tabs** using a shared pattern:

> A write updates `localStorage`, then dispatches a custom `window` event.
> Hooks listen for both that custom event **and** the native `storage` event
> (which fires in *other* tabs), and re-read on either.

### Catalog store ([lib/catalog.ts](src/lib/catalog.ts))
The single source of truth for **companies** and **service categories**.
- Seeds from [lib/data.ts](src/lib/data.ts) on first run.
- Storage keys: `al-assema-companies`, `al-assema-categories`.
- Change event: `al-assema-catalog-changed`.
- Read APIs: `getCompanies`, `getCompany(slug)`, `getCompaniesInCategory`,
  `getCategories`, `getCategory`, `getCategoriesWithCounts` (derives live counts).
- Write APIs: `addCompany`, `updateCompany`, `deleteCompany`, `addProject`,
  `deleteProject`, `addReview` / `deleteReview` (recompute aggregate rating),
  `addCategory`, `updateCategory`, `deleteCategory`.
- Maintenance: `resetCatalog`, `exportCatalog`, `importCatalog`.
- Helpers: `slugify`, `uniqueSlug`, `emptyCompany`.
- Reactive hooks: `useCompanies`, `useCategories`, `useCategoriesWithCounts`,
  `useCompany(slug)` (all built on the internal `useCatalogValue` subscriber).

> **Important:** Read companies/categories through the catalog store
> (`getCompanies`/`useCompanies`/…), **not** the raw arrays in `data.ts`. The
> `data.ts` arrays are only the seed.

### Leads store ([lib/requests.ts](src/lib/requests.ts))
Service requests submitted by customers.
- Storage key: `al-assema-leads`; "my device" key: `al-assema-my-requests`;
  event: `al-assema-leads-changed`.
- `Lead` type with `LeadStatus` = `New | Contacted | In Progress | Completed | Cancelled`.
  Also exports `LEAD_STATUSES`, `DISTRICTS`, `BUDGETS`.
- `addLead` generates a unique `id` + a human reference `AA-YYYYMMDD-XXXX`,
  defaults status to `New`, and records the lead id under "my requests" so the
  submitting device can track it without an account.
- Read/write: `getLeads`, `getLeadsForCompany`, `updateLeadStatus`, `deleteLead`,
  `addRawLeads`, `clearAllLeads`, `getMyLeads`.
- Hooks: `useLeads`, `useLeadsForCompany(slug)`, `useMyLeads`.

### Search ([lib/search.ts](src/lib/search.ts))
`search(query, limit=8)` runs an instant, local, case-insensitive search across
**categories**, **companies**, and **individual services** offered by companies,
returning a typed `SearchResult[]` ordered category → company → service item.
Also manages **recent searches** (`al-assema-recent-searches`, max 5) and a
fixed **popular searches** list.

### Analytics ([lib/analytics.ts](src/lib/analytics.ts))
Pure aggregation functions over `Lead[]` used by the dashboard charts:
`leadsPerDay`, `leadsPerMonth`, `leadsByStatus`, `conversionFunnel`,
`leadsByCompany`, `companyLeaderboard`, `periodDelta`. Also exports `STATUS_HEX`
colors and the `Point` / `Segment` data shapes the charts consume.

### Demo data ([lib/demo.ts](src/lib/demo.ts))
`loadDemoLeads(count=48)` inserts realistic sample leads spread over ~28 days
(weighted toward recent dates and earlier funnel stages) so admins can preview
the analytics. Triggered explicitly from Admin → Settings; never runs
automatically.

### Image handling ([lib/image.ts](src/lib/image.ts))
`fileToDataURL(file, maxDim, quality)` reads an uploaded image, downscales it on
a canvas (white matte for transparent logos), and returns a compressed JPEG
**data URL** small enough to persist in `localStorage`. `isDataUrl` distinguishes
uploaded images from pasted URLs. Used by the admin `ImageUpload`/`GalleryUpload`.

---

## 6. Hooks

| Hook              | File                                      | Purpose                                                          |
| ----------------- | ----------------------------------------- | ---------------------------------------------------------------- |
| `useSaved`        | [useSaved.ts](src/hooks/useSaved.ts)      | Saved/shortlisted company slugs (localStorage, reactive). `{ slugs, has, toggle, remove, count }` |
| `useCompare`      | [useCompare.ts](src/hooks/useCompare.ts)  | Compare set, capped at `COMPARE_MAX` (3). `{ slugs, has, isFull, toggle, remove, clear, count }` |
| `useCountUp`      | [useCountUp.ts](src/hooks/useCountUp.ts)  | Animates 0→target with ease-out cubic when the element scrolls into view |
| `useSearchOverlay`| [useSearch.ts](src/hooks/useSearch.ts)    | Reads the `openSearch` opener from the `RootLayout` outlet context |

Catalog/lead reactive hooks (`useCompanies`, `useLeads`, etc.) live alongside
their stores in `lib/`.

---

## 7. Components

| Component        | Role                                                                                  |
| ---------------- | ------------------------------------------------------------------------------------- |
| `TopNav`         | Fixed responsive nav. Transparent over the home hero, solid once scrolled. Desktop links + search/saved/requests/admin; mobile hamburger **drawer**. `/` keyboard shortcut opens search. Locks body scroll when the drawer is open. |
| `Footer`         | Multi-column footer (Platform / Services / Company) + admin & provider portal links. |
| `SearchOverlay`  | Full-screen instant search modal. Live results, keyboard nav (↑/↓/Enter/Esc), recent + popular + quick links. |
| `SearchInput`    | Reusable inline search box used across public lists and dashboards.                   |
| `CompareBar`     | Floating bar showing the compare selection; hidden on `/compare` and company pages.   |
| `SaveButton`     | Heart toggle (icon or pill variant) wired to `useSaved`; stops link navigation.       |
| `PersonalTabs`   | Segmented control linking Saved ↔ My Requests (with counts).                          |
| `LazyImage`      | Skeleton shimmer + blur-up reveal; lazy by default, `eager` for above-the-fold/LCP.   |
| `ScrollProgress` | Thin gradient bar showing page scroll depth.                                          |
| `Charts`         | SVG/CSS chart primitives: `ChartCard`, `KpiCard`, `Sparkline`, `AreaLineChart` (hover tooltip), `BarChart`, `BarList`, `DonutChart`, `FunnelChart`. Used by both dashboards. |

---

## 8. Design system

The visual system mirrors a **Material 3** token set, configured in
[tailwind.config.js](tailwind.config.js) and extended with custom CSS in
[index.css](src/index.css).

### Color tokens (Tailwind theme)
Semantic M3 names map to a teal-forward palette:
- **Primary** `#005578` (`primary-container` `#0b6e99`), on-primary white.
- **Secondary** `#785a02` (gold accent), with secondary-container/fixed variants.
- **Surfaces**: `surface` / `background` `#f7f9fd`, `surface-container*`
  ladder (`-lowest` `#ffffff` … `-highest` `#e0e3e6`), `inverse-surface`
  `#2d3134` (used by the footer).
- **Text**: `on-surface` `#181c1f`, `on-surface-variant` `#40484e`,
  `outline` `#70787f`, `outline-variant` `#bfc7cf`.
- **Error** `#ba1a1a`. (`darkMode: "class"` is enabled but the app ships light.)

### Typography
- **Display/headings** → Plus Jakarta Sans; **body** → Inter.
- Named type scale via `fontSize`/`fontFamily` tokens: `display-xl(-mobile)`,
  `headline-lg(-mobile)`, `headline-md`, `body-lg`, `body-md`, `label-md`,
  `label-sm` — each with preset size/line-height/weight/tracking.

### Spacing & layout tokens
Custom spacing scale: `stack-sm/md/lg/xl`, `gutter` (24px), `margin-mobile`
(16px), `margin-desktop` (48px), and `container-max` (1280px, also a `maxWidth`).

### Custom CSS utilities & animations ([index.css](src/index.css))
- **Surfaces/shadows**: `shadow-bloom`, `card-lift`, `soft-bloom`, `glass-card`,
  `glass-panel`, `hero-scrim`, `card-scrim` / `card-scrim-hover`,
  `text-shadow-soft`.
- **Reveal/motion**: `fade-up`, `slide-in-left/right`, `scale-reveal`,
  `page-enter`, plus eased curves as CSS vars (`--ease-spring`,
  `--ease-out-expo`, `--ease-smooth`, `--ease-snap`).
- **Feedback**: `skeleton-shimmer`, `spinner` / `spinner-primary`, `shake`
  (form errors), `animate-float`, `pulse-dot`, `count-flash`.
- **Charts**: `chart-bar`, `chart-bar-h`, `chart-fade`.
- **Mobile**: `mobile-scroll` + `mobile-bleed` (horizontal snap carousels),
  `drawer-left`, `touch-press`, `btn-press`, `mobile-cta-bar`, `scrollbar-hide`.
- **Forms**: `.field-input` (the standard input/select/textarea style with focus
  and `.error` states and a custom select arrow), `.modal-input`.
- **Lazy images**: `.img-lazy` blur-up states used by `LazyImage`.
- **Base layer**: forces ≥16px inputs (prevents iOS zoom), smooth scrolling,
  branded text selection, and a keyboard-only focus ring.

### Icons
Google **Material Symbols Outlined** via `<span className="material-symbols-outlined">`.
Filled state is toggled per-icon with inline
`style={{ fontVariationSettings: "'FILL' 1" }}`.

---

## 9. Key product rules & conventions

- **No login anywhere.** Customers never authenticate. Saves, the compare set,
  and "my requests" are all keyed to the **device** via `localStorage`.
- **Curated, admin-owned catalog.** Companies/categories are not self-registered;
  the admin owns them through the dashboard. Customers and providers read but
  never write the catalog.
- **Reactive localStorage stores.** Any module that persists data follows the
  "write → dispatch custom event; subscribe to custom + `storage` events"
  pattern so the UI updates live in the same tab and across tabs.
- **Read through the store, not the seed.** Use `catalog.ts` accessors, not the
  raw `data.ts` arrays.
- **Request links carry context** via query params
  (`/request?company=<slug>&companyName=<name>&service=<svc>`).
- **Dashboards are unprotected** internal routes (`/admin`, `/provider`) with no
  auth gate — appropriate only because there is no real backend/data.
- **Images** are either hotlinked Stitch/Wikimedia URLs (seed data) or
  admin-uploaded data URLs (compressed client-side).

---

## 10. Extending to a real backend

The UI is intentionally decoupled from persistence: every data operation goes
through the `lib/` store modules. To make the app multi-user, swap the
`localStorage` bodies in [catalog.ts](src/lib/catalog.ts) and
[requests.ts](src/lib/requests.ts) (and the reactive hooks) for real API /
Supabase calls. The pages, components, search, and analytics consume the same
function signatures and would not need to change.
