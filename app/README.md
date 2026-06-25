# Al Assema — Capital Digital Marketplace

A React app reproducing the six Stitch designs for *Al Assema*, the New
Administrative Capital digital marketplace. Built with Vite + React + TypeScript
+ Tailwind CSS + React Router. Images are hotlinked from the original Stitch
exports.

## Run

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build to dist/
npm run preview  # preview the production build
```

## Screens / routes

| Route                   | Screen                                                |
| ----------------------- | ----------------------------------------------------- |
| `/`                     | Explore Services — NAC towers hero + bookable services |
| `/partners`             | Verified Partners directory                           |
| `/projects`             | Projects Gallery (masonry + filter chips)             |
| `/projects/apex-tower`  | Project Details (bento gallery + provider card)       |
| `/request`              | Request Service (4-step wizard → creates a booking)   |
| `/admin`                | Operations dashboard — company + provider booking views |
| `/login`                | Authentication (kept, but no longer linked in nav)    |

Shared `TopNav` + `Footer` wrap the public pages; `/request`, `/admin` and
`/login` are standalone screens.

## Booking flow (no login required)

1. A visitor picks a service on the home page and clicks **Book Service** (or
   uses the **Request a Service** wizard).
2. They enter their contact details — no account needed — and submit.
3. The booking is saved and instantly appears on the **`/admin` dashboard** for
   both the company (all bookings) and the relevant provider (filtered view),
   where status can be advanced New → Contacted → Confirmed → Completed.

Bookings persist in the browser via `localStorage` (see
[`src/lib/bookings.ts`](src/lib/bookings.ts)); the dashboard updates live in the
same tab and across tabs. Swap this module for real API/Supabase calls to make
it multi-user — the rest of the UI stays the same.

The home hero hotlinks a photo of the **Iconic Tower** in the New Administrative
Capital from Wikimedia Commons.

## Design system

The Tailwind theme in `tailwind.config.js` mirrors the Stitch Material-3 token
set exactly (colors, spacing, type scale). Custom utilities (`soft-bloom`,
`glass-panel`, `masonry-grid`, etc.) live in `src/index.css`. Icons use Google
**Material Symbols Outlined** via the `<Icon>` helper.
